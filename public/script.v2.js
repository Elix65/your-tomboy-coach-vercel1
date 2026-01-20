// ===============================
// IMPORTAR SUPABASE
// ===============================
import supabaseClient from './supabase.js';
// ===============================
// CONTEXTO DE PÁGINA
// ===============================
const isGachaPage = window.location.pathname.includes("gacha.html");

// ===============================
// VERIFICAR SESIÓN
// ===============================
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) window.location.href = "/login.html";
});

// ===============================
// NAVEGACIÓN TOP BAR
// ===============================
const btnGacha = document.getElementById("btn-gacha");
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");

if (btnGacha) {
  btnGacha.onclick = () => {
    if (isGachaPage) {
      window.location.href = "index.html";
    } else {
      window.location.href = "gacha.html";
    }
  };
}


if (btnInventario) {
  btnInventario.onclick = () => {
    if (typeof openInventoryPanelGacha === "function") {
      openInventoryPanelGacha();
    }
  };
}

if (btnLogout) {
  btnLogout.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// MENÚ HAMBURGUESA
// ===============================
const hamburgerBtn = document.getElementById("hamburger-btn");
const mobileMenu = document.getElementById("mobile-menu-overlay");

if (hamburgerBtn && mobileMenu) {
  hamburgerBtn.onclick = () => {
    mobileMenu.classList.toggle("hidden");
    mobileMenu.classList.toggle("active");
    hamburgerBtn.classList.toggle("open");
  };

  mobileMenu.onclick = (e) => {
    if (e.target === mobileMenu) {
      mobileMenu.classList.add("hidden");
      mobileMenu.classList.remove("active");
      hamburgerBtn.classList.remove("open");
    }
  };
}

// Mobile botones
const mInv = document.getElementById("m-inventario");
const mGacha = document.getElementById("m-gacha");
const mLogout = document.getElementById("m-logout");

if (mInv) mInv.onclick = () => openInventoryPanelGacha();
if (mGacha) mGacha.onclick = () => window.location.href = "gacha.html";
if (mLogout) {
  mLogout.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// CHAT YUMIKO (solo si existe)
// ===============================
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

if (chatBox && userInput && sendBtn) {

  function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.classList.add("message", sender);

    if (sender === "bot") {
      const avatar = document.createElement("img");
      avatar.src = "varios/yumiko/yumiko-face-full-face.png";
      avatar.classList.add("avatar-small");
      msg.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.textContent = text;

    msg.appendChild(bubble);
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  async function saveMessage({ userId, sender, content }) {
    if (!userId) return;
    await supabaseClient.from("messages").insert({ user_id: userId, sender, content });
  }

  async function loadChat(userId) {
    const { data } = await supabaseClient
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    data?.forEach(m => addMessage(m.content, m.sender));
  }

  supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) return;
    await loadChat(user.id);

    sendBtn.onclick = async () => {
      const text = userInput.value.trim();
      if (!text) return;

      addMessage(text, "user");
      userInput.value = "";
      saveMessage({ userId: user.id, sender: "user", content: text });

      try {
        const res = await fetch("/api/yumiko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        });

        const data = await res.json();
        addMessage(data.reply, "bot");
        saveMessage({ userId: user.id, sender: "bot", content: data.reply });

      } catch {
        addMessage("Hubo un error al conectar con Yumiko.", "bot");
      }
    };
  });
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
    closeBtn.onclick = () => {
      overlay.remove();
      document.body.classList.remove("no-scroll");
    };

    const content = document.createElement("div");
    content.id = "inventory-content";
    content.innerHTML = `<p style="color:#ccc">Cargando...</p>`;

    drawer.appendChild(closeBtn);
    drawer.appendChild(content);
    overlay.appendChild(drawer);

    // Cerrar si clickean fuera del drawer
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        document.body.classList.remove("no-scroll");
      }
    });

    document.body.appendChild(overlay);
  }

  // Bloquear scroll del fondo (aprovecha tu CSS body.no-scroll)
  document.body.classList.add("no-scroll");

  const content = document.getElementById("inventory-content");
  if (!content) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id;

    if (!userId) {
      content.innerHTML = `<p style="color:#f88">No se pudo obtener tu sesión.</p>`;
      return;
    }

    const res = await fetch(`/api/inventario?user_id=${userId}`);
    const data = await res.json();
    const items = data.inventario || [];

    if (!items.length) {
      content.innerHTML = `<p style="color:#ccc">No tenés skins todavía.</p>`;
      return;
    }

    content.innerHTML = items.map(i => {
      const rareza = (i.rareza || "comun").toLowerCase();
      const color =
        rareza === "rara" ? "#4da6ff" :
        rareza === "epica" || rareza === "épica" ? "#c77dff" :
        rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

      return `
        <div class="inv-item">
          <img src="${i.imagen_url || '/varios/placeholder.png'}" class="inv-img">
          <div class="inv-info">
            <div class="inv-nombre" style="color:${color}">${i.nombre || "Sin nombre"}</div>
            <div class="inv-detalle">
              ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad || 1}
            </div>
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
// UI
// ===============================
async function initializeUI() {
  const { data: { user } = {} } = await supabaseClient.auth.getUser();
  if (!user) return;

  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu-overlay");

  const isMobile = window.innerWidth <= 768;

  // Top bar solo desktop
  if (topBar) {
    if (isMobile) topBar.classList.add("hidden");
    else topBar.classList.remove("hidden");
  }

  // Hamburguesa solo mobile
  if (hamburgerBtn) {
    if (isMobile) hamburgerBtn.classList.remove("hidden");
    else hamburgerBtn.classList.add("hidden");
  }

  // Overlay mobile siempre empieza cerrado
  if (mobileMenu) {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
  }
}

window.addEventListener("DOMContentLoaded", initializeUI);

// Extra pro: si rotan pantalla / resize, se ajusta solo
window.addEventListener("resize", initializeUI);

