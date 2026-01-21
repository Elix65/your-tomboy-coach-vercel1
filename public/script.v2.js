import supabaseClient from './supabase.js';




supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  // mostrar UI
});


// ===============================
// NAVEGACIÓN TOP BAR
// ===============================
const btnGacha = document.getElementById("btn-gacha");
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");

if (btnGacha) {
  btnGacha.onclick = () => window.location.href = "gacha.html";
}

if (btnInventario) {
  btnInventario.onclick = () => openInventoryPanelGacha();
}

if (btnLogout) {
  btnLogout.onclick = async () => {
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
    window.location.href = "gacha.html";
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
// CHAT YUMIKO (VERSIÓN ESTABLE + SUPABASE)
// ===============================

// 1) Función para guardar mensajes en Supabase
async function saveMessageToSupabase({ userId, sender, content }) {
  console.log("Intentando guardar mensaje:", { userId, sender, content });

  if (!userId) {
    console.error("❌ ERROR: userId está vacío. No se puede guardar.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("messages")
    .insert({
      user_id: userId,
      sender,
      content
    })
    .select();

  if (error) {
    console.error("❌ Supabase rechazó el insert:", error);
  } else {
    console.log("✅ Mensaje guardado correctamente:", data);
  }
}


// 2) Función para cargar historial desde Supabase
async function loadChatFromSupabase(userId) {
  console.log("Cargando historial para userId:", userId);

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("user_id", userId.toString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error cargando historial:", error);
    return;
  }

  console.log("Historial cargado:", data);
  console.log("userId:", userId, "tipo:", typeof userId);
  data.forEach(msg => addMessage(msg.content, msg.sender));
}

// ===============================
// CHAT UI
// ===============================
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

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

// ===============================
// EVENTOS DE INPUT
// ===============================
if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });
}
// ===============================
// REGENERAR + REINICIAR CHAT
// ===============================

// Soporta varios IDs por si en tu HTML cambian nombres
const regenBtn =
  document.getElementById("regen-btn") ||
  document.getElementById("regenerate-btn") ||
  document.getElementById("btn-regenerar") ||
  document.getElementById("btn-regenerate");

const resetBtn =
  document.getElementById("reset-chat-btn") ||
  document.getElementById("reiniciar-chat-btn") ||
  document.getElementById("btn-reiniciar") ||
  document.getElementById("btn-reset-chat");

// Estado para regenerar
let lastUserText = null;
let lastBotMsgEl = null; // referencia al último mensaje del bot en UI

// Helpers UI
function setButtonsDisabled(disabled) {
  if (sendBtn) sendBtn.disabled = disabled;
  if (regenBtn) regenBtn.disabled = disabled;
  if (resetBtn) resetBtn.disabled = disabled;
}

function showTyping(show) {
  const typing = document.getElementById("typing");
  if (!typing) return;
  typing.classList.toggle("hidden", !show);
}

// Versión extendida: devuelve el elemento DOM del mensaje creado
function addMessageWithRef(text, sender) {
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

  return msg;
}

// En tu código ya existe addMessage(); lo dejamos.
// Solo usamos addMessageWithRef para poder "reemplazar" el último bot.
function removeLastBotFromUI() {
  if (lastBotMsgEl && lastBotMsgEl.parentNode) {
    lastBotMsgEl.parentNode.removeChild(lastBotMsgEl);
  } else {
    // fallback: buscar el último .message.bot
    const bots = chatBox ? chatBox.querySelectorAll(".message.bot") : null;
    const last = bots && bots.length ? bots[bots.length - 1] : null;
    if (last && last.parentNode) last.parentNode.removeChild(last);
  }
  lastBotMsgEl = null;
}

// Borrar UI del chat
function clearChatUI() {
  if (!chatBox) return;
  chatBox.innerHTML = "";
}

// --- REGENERAR ---
async function regenerateLastReply(user) {
  if (!chatBox || !lastUserText) {
    // nada que regenerar
    addMessage("No hay ningún mensaje para regenerar todavía.", "bot");
    return;
  }

  setButtonsDisabled(true);
  showTyping(true);

  try {
    const res = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: lastUserText })
    });

    const data = await res.json();
    const reply = data?.reply || "…";

    // Reemplazar la última respuesta del bot en UI (más natural)
    removeLastBotFromUI();
    lastBotMsgEl = addMessageWithRef(reply, "bot");

    // Guardar NUEVA respuesta del bot en Supabase (no tocamos el historial viejo)
    await saveMessageToSupabase({
      userId: user.id,
      sender: "bot",
      content: reply
    });

    const yumikoSound = document.getElementById("yumiko-sound");
    if (yumikoSound) {
      yumikoSound.currentTime = 0;
      yumikoSound.play();
    }
  } catch (e) {
    console.warn(e);
    addMessage("Hubo un error al regenerar la respuesta.", "bot");
  } finally {
    showTyping(false);
    setButtonsDisabled(false);
  }
}

// --- REINICIAR CHAT ---
async function resetChat(user) {
  if (!chatBox) return;

  setButtonsDisabled(true);
  showTyping(true);

  try {
    // 1) Borrar historial en Supabase (si RLS permite)
    const { error } = await supabaseClient
      .from("messages")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.warn("No se pudo borrar en Supabase (probable RLS):", error);
      // igual limpiamos UI para que el usuario sienta que funcionó
    }

    // 2) Limpiar UI y estado local
    clearChatUI();
    lastUserText = null;
    lastBotMsgEl = null;

    // 3) Mensaje inicial (opcional)
    addMessage("Chat reiniciado. ¿Qué querés contarme ahora?", "bot");
    await saveMessageToSupabase({
      userId: user.id,
      sender: "bot",
      content: "Chat reiniciado. ¿Qué querés contarme ahora?"
    });

  } catch (e) {
    console.warn(e);
    addMessage("No pude reiniciar el chat por un error.", "bot");
  } finally {
    showTyping(false);
    setButtonsDisabled(false);
  }
}

// Hookear botones cuando ya hay user (para asegurar session)
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;

  // regenerar
  if (regenBtn) {
    regenBtn.onclick = () => regenerateLastReply(user);
  }

  // reiniciar chat
  if (resetBtn) {
    resetBtn.onclick = () => resetChat(user);
  }
});

// ===============================
// OBTENER USER Y CARGAR HISTORIAL
// ===============================
supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  // Cargar historial del chat
  await loadChatFromSupabase(user.id);

  // Activar botón de enviar
  if (sendBtn) {
    sendBtn.onclick = async () => {
      const text = userInput.value.trim();
      if (!text) return;

      addMessage(text, "user");
      lastUserText = text;


      // Guardar mensaje del usuario
      saveMessageToSupabase({
        userId: user.id,
        sender: "user",
        content: text
      });

      userInput.value = "";

      const typing = document.getElementById("typing");
      typing.classList.remove("hidden");

      try {
        const res = await fetch("/api/yumiko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        });

        const data = await res.json();
        lastBotMsgEl = addMessageWithRef(data.reply, "bot");

        // Guardar mensaje del bot
        saveMessageToSupabase({
          userId: user.id,
          sender: "bot",
          content: data.reply
        });

        const yumikoSound = document.getElementById("yumiko-sound");
        yumikoSound.currentTime = 0;
        yumikoSound.play();

      } catch (e) {
        addMessage("Hubo un error al conectar con Yumiko.", "bot");
      }

      typing.classList.add("hidden");
    };
  }
});

// ===============================
// FONDO DE CHAT (SKIN ACTIVA) — SOLO INDEX
// ===============================
function isChatPage() {
  const path = (window.location.pathname || "").toLowerCase();
  return path.endsWith("/index.html") || path === "/" || path.endsWith("/");
}

function applyChatBackground(url) {
  const bg = document.getElementById("yumiko-bg");
  if (!bg) return; // si no estás en index/chat, no hace nada

  if (!url) {
    bg.style.backgroundImage = "";
    return;
  }

  bg.style.backgroundImage = `url("${url}")`;
  bg.style.backgroundSize = "cover";
  bg.style.backgroundRepeat = "no-repeat";
  bg.style.backgroundPosition = "center";
  bg.style.opacity = "0.18"; // ajustable
}

async function setActiveSkinBackground(skinId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user || !skinId) return;

  const res = await fetch("/api/set-active-skin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, skin_id: skinId })
  });

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    console.warn("set-active-skin error:", data);
    return;
  }

  applyChatBackground(data?.imagen_url || "");
}

async function loadActiveSkinBackground() {
  if (!isChatPage()) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  try {
    const r = await fetch(`/api/get-active-skin?user_id=${user.id}`);
    const d = await r.json();
    applyChatBackground(d?.imagen_url || "");
  } catch (e) {
    console.warn("No se pudo cargar fondo activo");
  }
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
        <img src="${i.imagen_url || '/varios/placeholder.png'}" class="inv-img">
        <div class="inv-info">
          <div class="inv-nombre" style="color:${color}">${i.nombre || "Sin nombre"}</div>
          <div class="inv-detalle">
            ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad || 1}
          </div>

          ${isChatPage() ? `
            <button class="inv-use-btn" data-skin-id="${i.skin_id}">
              Usar como fondo
            </button>
          ` : ``}
        </div>
      </div>
    `;
  })
  .join("");

// ✅ Activar clicks SOLO en index.html (chat)
if (isChatPage()) {
  content.querySelectorAll(".inv-use-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const skinId = btn.getAttribute("data-skin-id");
      await setActiveSkinBackground(skinId);
    });
  });
}
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
}

// ===============================
// AUDIO + PARALLAX + INICIALIZACIÓN
// ===============================
window.addEventListener("DOMContentLoaded", async () => {
  await initializeUI();
  await loadActiveSkinBackground();

  const ambienceIntro = document.getElementById("ambience-intro");
  const ambienceLoop = document.getElementById("ambience-loop");

  if (ambienceIntro) {
    ambienceIntro.volume = 0;
    ambienceIntro.play().then(() => fadeIn(ambienceIntro, 0.12));
    ambienceIntro.onended = () => {
      ambienceLoop.volume = 0;
      ambienceLoop.play();
      fadeIn(ambienceLoop, 0.18);
    };
  }

  function fadeIn(audio, target) {
    let v = 0;
    const interval = setInterval(() => {
      v += 0.02;
      audio.volume = Math.min(v, target);
      if (v >= target) clearInterval(interval);
    }, 80);
  }

  if (window.innerWidth > 768) {
    document.addEventListener("mousemove", (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;

      document.querySelector(".layer-wood").style.transform = `translate(${x}px, ${y}px)`;
      document.querySelector(".layer-shoji").style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
      document.querySelector(".layer-pattern").style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });
  }
});
