
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
    drawer.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
    drawer.style.backdropFilter = "blur(6px)";
    drawer.style.display = "flex";
    drawer.style.flexDirection = "column";
    drawer.style.gap = "12px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.className = "inventory-close-btn";
    closeBtn.onclick = () => overlay.remove();

    const content = document.createElement("div");
    content.id = "inventory-content";
    content.innerHTML = `<p style="color:#ccc">Cargando...</p>`;

    drawer.appendChild(closeBtn);
    drawer.appendChild(content);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  const content = document.getElementById("inventory-content");
  if (!content) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      content.innerHTML = `<p style="color:#f88">No se pudo obtener tu sesión.</p>`;
      return;
    }

    const res = await fetch("/api/inventario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });

    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      content.innerHTML = `<p style="color:#ccc">No tenés skins todavía.</p>`;
      return;
    }

    content.innerHTML = items.map(i => {
      const rareza = i.rareza?.toLowerCase() || "comun";
      const color =
        rareza === "rara" ? "#4da6ff" :
        rareza === "epica" || rareza === "épica" ? "#c77dff" :
        rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

      return `
        <div style="padding:8px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.03)">
          <div style="font-weight:600;color:${color}">${i.nombre}</div>
          <div style="font-size:13px;opacity:0.8;margin-top:4px">
            ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad}
          </div>
        </div>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    content.innerHTML = `<p style="color:#f88">No se pudo cargar el inventario.</p>`;
  }
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
