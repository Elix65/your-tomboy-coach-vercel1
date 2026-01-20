// ===============================
// IMPORTAR SUPABASE
// ===============================
import supabaseClient from "./supabase.js";

// ===============================
// GUARD: SI NO HAY SESIÓN, LOGIN
// ===============================
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
});

// ===============================
// NAVEGACIÓN TOP BAR (UNIVERSAL)
// ===============================
const btnGacha = document.getElementById("btn-gacha");       // existe en index
const btnInicio = document.getElementById("btn-inicio");     // existe en gacha
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");

if (btnGacha) {
  btnGacha.onclick = () => (window.location.href = "gacha.html");
}

if (btnInicio) {
  btnInicio.onclick = () => (window.location.href = "index.html");
}

if (btnInventario) {
  btnInventario.onclick = () => {
    if (typeof openInventoryPanelGacha === "function") {
      openInventoryPanelGacha();
    } else if (typeof openInventoryPanel === "function") {
      openInventoryPanel();
    } else {
      console.warn("No hay función de inventario disponible.");
    }
  };
}

if (btnLogout) {
  btnLogout.onclick = async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn("Error al cerrar sesión:", e);
    }
    window.location.href = "login.html";
  };
}

// ===============================
// MENÚ HAMBURGUESA (UNIVERSAL)
// ===============================
const hamburgerBtn = document.getElementById("hamburger-btn");
const mobileMenu = document.getElementById("mobile-menu-overlay");

function closeMobileMenu() {
  if (!mobileMenu) return;
  mobileMenu.classList.add("hidden");
  mobileMenu.classList.remove("active");
  if (hamburgerBtn) hamburgerBtn.classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function openMobileMenu() {
  if (!mobileMenu) return;
  mobileMenu.classList.remove("hidden");
  mobileMenu.classList.add("active");
  if (hamburgerBtn) hamburgerBtn.classList.add("open");
  document.body.classList.add("no-scroll");
}

if (hamburgerBtn && mobileMenu) {
  hamburgerBtn.onclick = () => {
    const isHidden = mobileMenu.classList.contains("hidden");
    if (isHidden) openMobileMenu();
    else closeMobileMenu();
  };
}

if (mobileMenu) {
  mobileMenu.onclick = (e) => {
    // cierra solo si clickean el overlay, no el drawer/botones
    if (e.target === mobileMenu) closeMobileMenu();
  };
}

// Botones internos del menú mobile
const mInv = document.getElementById("m-inventario");
const mGacha = document.getElementById("m-gacha");     // existe en index
const mInicio = document.getElementById("m-inicio");   // existe en gacha
const mLogout = document.getElementById("m-logout");

if (mInv) {
  mInv.onclick = () => {
    closeMobileMenu();

    if (typeof openInventoryPanelGacha === "function") {
      openInventoryPanelGacha();
    } else if (typeof openInventoryPanel === "function") {
      openInventoryPanel();
    } else {
      console.warn("No hay función de inventario disponible.");
    }
  };
}

if (mGacha) {
  mGacha.onclick = () => {
    closeMobileMenu();
    window.location.href = "gacha.html";
  };
}

if (mInicio) {
  mInicio.onclick = () => {
    closeMobileMenu();
    window.location.href = "index.html";
  };
}

if (mLogout) {
  mLogout.onclick = async () => {
    closeMobileMenu();
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn("Error al cerrar sesión:", e);
    }
    window.location.href = "login.html";
  };
}

// ===============================
// CHAT YUMIKO (VERSIÓN ESTABLE + SUPABASE)
// ===============================

// Guardar mensaje
async function saveMessageToSupabase({ userId, sender, content }) {
  if (!userId) return;

  const { error } = await supabaseClient
    .from("messages")
    .insert({ user_id: userId, sender, content });

  if (error) console.error("Error guardando mensaje:", error);
}

// Cargar historial
async function loadChatFromSupabase(userId) {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("user_id", userId.toString())
    .order("created_at", { ascending: true });

  if (error) return console.error("Error cargando historial:", error);
  data.forEach((msg) => addMessage(msg.content, msg.sender));
}

// Render de mensajes
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

function addMessage(text, sender) {
  if (!chatBox) return;

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

// Enter para enviar
if (userInput && sendBtn) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });
}

// Inicializar chat solo si existe
if (chatBox && userInput && sendBtn) {
  supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) {
      window.location.href = "/login.html";
      return;
    }

    await loadChatFromSupabase(user.id);

    sendBtn.onclick = async () => {
      const text = userInput.value.trim();
      if (!text) return;

      addMessage(text, "user");
      userInput.value = "";

      await saveMessageToSupabase({ userId: user.id, sender: "user", content: text });

      const typing = document.getElementById("typing");
      if (typing) typing.classList.remove("hidden");

      try {
        const res = await fetch("/api/yumiko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        const data = await res.json();
        addMessage(data.reply, "bot");
        await saveMessageToSupabase({ userId: user.id, sender: "bot", content: data.reply });

        const yumikoSound = document.getElementById("yumiko-sound");
        if (yumikoSound) {
          yumikoSound.currentTime = 0;
          yumikoSound.play();
        }
      } catch (e) {
        addMessage("Hubo un error al conectar con Yumiko.", "bot");
      }

      if (typing) typing.classList.add("hidden");
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

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        document.body.classList.remove("no-scroll");
      }
    });

    document.body.appendChild(overlay);
  }

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

    content.innerHTML = items
      .map((i) => {
        const rareza = (i.rareza || "comun").toLowerCase();
        const color =
          rareza === "rara" ? "#4da6ff" :
          rareza === "epica" || rareza === "épica" ? "#c77dff" :
          rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

        return `
          <div class="inv-item">
            <img src="${i.imagen_url || "/varios/placeholder.png"}" class="inv-img">
            <div class="inv-info">
              <div class="inv-nombre" style="color:${color}">${i.nombre || "Sin nombre"}</div>
              <div class="inv-detalle">
                ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad || 1}
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    content.innerHTML = `<p style="color:#f88">No se pudo cargar el inventario.</p>`;
  }
}

// ===============================
// MOSTRAR UI SI HAY SESIÓN
// ===============================
async function initializeUI() {
  const { data: { user } = {} } = await supabaseClient.auth.getUser();
  if (!user) return;

  const topBar = document.getElementById("top-bar");
  const hamburger = document.getElementById("hamburger-btn");
  const overlay = document.getElementById("mobile-menu-overlay");

  const isMobile = window.innerWidth <= 768;

  // Top bar: solo desktop
  if (topBar) {
    if (isMobile) topBar.classList.add("hidden");
    else topBar.classList.remove("hidden");
  }

  // Hamburguesa: solo mobile
  if (hamburger) {
    if (isMobile) hamburger.classList.remove("hidden");
    else hamburger.classList.add("hidden");
  }

  // Overlay siempre cerrado al init
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("active");
  }

  document.body.classList.remove("no-scroll");
}

window.addEventListener("DOMContentLoaded", initializeUI);
window.addEventListener("resize", initializeUI);
