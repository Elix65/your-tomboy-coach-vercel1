
// ===============================
// NAVEGACIÓN TOP BAR
// ===============================
const btnGachaNav = document.getElementById("btn-gacha");
const btnInvNav = document.getElementById("btn-inventario");
const btnLogoutNav = document.getElementById("btn-logout");

if (btnGachaNav) {
  btnGachaNav.onclick = () => window.location.href = "index.html";
}

if (btnInvNav) {
  btnInvNav.onclick = () => openInventoryPanelGacha();
}

if (btnLogoutNav) {
  btnLogoutNav.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// MENÚ HAMBURGUESA (MOBILE)
// ===============================
const hamburgerBtn = document.getElementById("hamburger-btn");
const mobileMenu = document.getElementById("mobile-menu-overlay");

if (hamburgerBtn) {
  hamburgerBtn.onclick = () => {
    mobileMenu.classList.toggle("hidden");
    mobileMenu.classList.toggle("active");
    hamburgerBtn.classList.toggle("open");
  };
}

if (mobileMenu) {
  mobileMenu.onclick = (e) => {
    if (e.target === mobileMenu) {
      mobileMenu.classList.add("hidden");
      mobileMenu.classList.remove("active");
      hamburgerBtn.classList.remove("open");
    }
  };
}

// Botones internos del menú mobile
const mInv = document.getElementById("m-inventario");
const mGacha = document.getElementById("m-gacha");
const mLogout = document.getElementById("m-logout");

if (mInv) {
  mInv.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    openInventoryPanelGacha();
  };
}

if (mGacha) {
  mGacha.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    window.location.href = "index.html";
  };
}

if (mLogout) {
  mLogout.onclick = async () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// SISTEMA GACHA
// ===============================
let userId = null;

supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (user) userId = user.id;
});

const btn1 = document.getElementById("btn-tirar-1");
const btn10 = document.getElementById("btn-tirar-10");
const divRes = document.getElementById("gacha-resultados");

if (btn1) {
  btn1.onclick = async () => {
    const res = await fetch("/api/tirar-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });

    const data = await res.json();
    const s = data.skin;

    divRes.innerHTML = `
      <h3>Resultado:</h3>
      <p class="skin-${s.rareza} reveal">
        ${s.nombre} (${s.rareza})
      </p>
    `;
  };
}

if (btn10) {
  btn10.onclick = async () => {
    const res = await fetch("/api/tirar-multiple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, cantidad: 10 })
    });

    const data = await res.json();

    divRes.innerHTML = `
      <h3>Resultados (${data.cantidad}):</h3>
      <div class="gacha-grid">
        ${data.resultados
          .map(s => `
            <p class="skin-${s.rareza} reveal">
              ${s.nombre} (${s.rareza})
            </p>
          `)
          .join("")}
      </div>
    `;
  };
}

// ===============================
// INVENTARIO LATERAL (VERSIÓN GACHA)
// ===============================
async function openInventoryPanelGacha() {
  let overlay = document.getElementById("inventory-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "inventory-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "10000";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "flex-end";

    const drawer = document.createElement("div");
    drawer.style.width = "360px";
    drawer.style.maxWidth = "90%";
    drawer.style.background = "rgba(0,0,0,0.85)";
    drawer.style.padding = "18px";
    drawer.style.overflowY = "auto";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.onclick = () => overlay.remove();

    drawer.appendChild(closeBtn);

    const content = document.createElement("div");
    content.id = "inventory-content";
    drawer.appendChild(content);

    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  const content = document.getElementById("inventory-content");
  content.innerHTML = "Cargando...";

  const res = await fetch("/api/inventario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });

  const data = await res.json();

  content.innerHTML = data.items
    .map(i => `<p>${i.nombre} (${i.rareza}) x${i.cantidad}</p>`)
    .join("");
}

// ===============================
// MOSTRAR UI SI HAY SESIÓN
// ===============================
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;

  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu-overlay");

  if (topBar) topBar.classList.remove("hidden");

  if (hamburgerBtn) {
    if (window.innerWidth <= 768) {
      hamburgerBtn.classList.remove("hidden");
    } else {
      hamburgerBtn.classList.add("hidden");
    }
  }

  if (mobileMenu) {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
  }
});
