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
// INVENTARIO GACHA
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
    drawer.style.background = "rgba(0,0,0,0.85)";
    drawer.style.padding = "18px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.onclick = () => overlay.remove();

    const content = document.createElement("div");
    content.id = "inventory-content";
    content.innerHTML = "Cargando...";

    drawer.append(closeBtn, content);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  const content = document.getElementById("inventory-content");
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const res = await fetch(`/api/inventario?user_id=${user.id}`);
  const data = await res.json();

  content.innerHTML = data.inventario?.map(i => `
    <div class="inv-item">
      <img src="${i.imagen_url}">
      <div>${i.nombre} • x${i.cantidad}</div>
    </div>
  `).join("") || "No tenés items.";
}

// ===============================
// UI
// ===============================
async function initializeUI() {
  const { data: { user } = {} } = await supabaseClient.auth.getUser();
  if (!user) return;

  const topBar = document.getElementById("top-bar");
  if (topBar) topBar.classList.remove("hidden");
}

window.addEventListener("DOMContentLoaded", initializeUI);
