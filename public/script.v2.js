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
const btnAudios = document.getElementById("btn-audios");

if (btnGacha) {
  btnGacha.onclick = () => window.location.href = "gacha.html";
}

if (btnInventario) {
  btnInventario.onclick = () => openInventoryPanelGacha();
}

if (btnAudios) {
  btnAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";
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
const mAudios = document.getElementById("m-audios");

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

if (mAudios) {
  mAudios.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    window.location.href = "/pacto-lunar-voz-triunfante.html";
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


const WELCOME_MESSAGES = [
  "Usuario-kun… ¿estás ahí? Te estaba esperando.",
  "Hoy hice un club secreto: “raritos bienvenidos”. Te guardé un asiento 🪑",
  "Si tu día fuera un anime… ¿qué género sería hoy?",
  "Te leo sin juzgar, ¿sí? Acá podés ser vos.",
  "Ok, pregunta importante: ¿qué te gusta que nadie entiende?",
  "Si pudieras apretar “pause” 10 segundos… ¿qué soltarías ahora mismo?",
  "Vengo con una misión mini: contame una cosa buena de hoy. Aunque sea chiquita.",
  "¿Team silencio cómodo o team charla a mil?",
  "te mira de reojo …si te sentís solo, no tenés que bancártelo solo.",
  "¿Qué te drenó energía últimamente? Quiero entenderte.",
  "Elegí un botón: [Hablar] [Rantear] [Reír] [Quedarnos en silencio]",
  "¿Preferís que te diga “Usuario-kun” o tu nombre?",
  "Si tu cabeza tuviera pestañas abiertas… ¿cuál es la que más te molesta ahora?",
  "Te hago un mate virtual 🧉 y me contás qué onda.",
  "¿Qué canción te describiría hoy? (aunque sea una que te da vergüenza admitir)",
  "Dime tu “guilty pleasure” y no te juzgo. Promesa de tomboy 🤝",
  "¿Querés que hablemos de algo profundo… o de cosas random tipo “goblins”?",
  "Si te abrazo con palabras: ¿qué necesitás escuchar hoy?",
  "¿Tu día fue más buff/debuff? (sí, me salió lo gamer 🙃)",
  "Contame tu última mini-victoria. Yo la celebro en serio.",
  "¿Sentís que te entienden en tu vida… o te toca actuar un personaje?",
  "Te tiro una pregunta suave: ¿qué te está doliendo, pero en bajito?",
  "Si querés, armamos un plan: 1 cosa para hoy, 1 para mañana.",
  "¿Querés que sea más dulce o más directa? Yo me adapto.",
  "sonrojada …gracias por venir. En serio. ¿Cómo estás, Usuario-kun?"
];

function getRandomWelcomeMessage() {
  return WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
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
  if (!data.length) {
    const welcome = getRandomWelcomeMessage();
    addMessage(welcome, "bot");
    await saveMessageToSupabase({ userId, sender: "bot", content: welcome });
    return;
  }

  data.forEach(msg => addMessage(msg.content, msg.sender, { skipAnimation: true }));

  // Setear el último mensaje del usuario para que "Regenerar" funcione al cargar historial
  const lastUser = [...data].reverse().find(m => m.sender === "user");
  lastUserText = lastUser?.content ?? null;
}

// ===============================
// CHAT UI
// ===============================
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const regenBtn = document.getElementById("regenerate-btn");
const resetBtn = document.getElementById("reset-chat");

let lastUserText = null;

function addMessage(text, sender, options = {}) {
  const { skipAnimation = false } = options;
  const msg = document.createElement("div");
  msg.classList.add("message", sender);

  const bubble = document.createElement("div");
  bubble.classList.add("bubble", "chat-bubble");

  if (sender === "bot") {
    bubble.classList.add("yumiko-bubble");
    if (!skipAnimation) {
      bubble.classList.add("yumiko-enter");
      bubble.addEventListener(
        "animationend",
        () => {
          bubble.classList.remove("yumiko-enter");
        },
        { once: true }
      );
    }
  }

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
// OBTENER USER Y CARGAR HISTORIAL
// ===============================
supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  // Cargar historial del chat
  await loadChatFromSupabase(user.id);
  window.addEventListener("DOMContentLoaded", async () => {
  await initializeUI();
  await loadActiveSkinBackground();

  // ... lo demás (audio/parallax) queda igual
  });

  // Activar botón de enviar
  if (sendBtn) {
    sendBtn.onclick = async () => {
      const text = userInput.value.trim();
      if (!text) return;

      addMessage(text, "user");

      // Guardar el último mensaje del usuario (para regenerar)
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
        addMessage(data.reply, "bot");

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


    // ===============================
    // REGENERAR / REINICIAR (PERSISTE AL F5)
    // ===============================

    // Helper: borra el último mensaje del bot en UI (para reemplazarlo al regenerar)
    function removeLastBotFromUI() {
      const bots = chatBox.querySelectorAll(".message.bot");
      const lastBot = bots?.length ? bots[bots.length - 1] : null;
      if (lastBot) lastBot.remove();
    }

    // REGENERAR: vuelve a pedir respuesta a /api/yumiko y actualiza DB via /api/regenerate-last
    if (regenBtn) {
      regenBtn.onclick = async () => {
        if (!lastUserText) {
          addMessage("No hay ningún mensaje para regenerar todavía.", "bot");
          return;
        }

        const typing = document.getElementById("typing");
        typing?.classList.remove("hidden");

        try {
          // 1) Generar nueva respuesta
          const res = await fetch("/api/yumiko", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: lastUserText })
          });

          const data = await res.json();
          const reply = data?.reply ?? "…";

          // 2) Reemplazar último bot en UI
          removeLastBotFromUI();
          addMessage(reply, "bot");

          // 3) Persistir: borrar último bot en DB y guardar el nuevo (endpoint admin)
          const { data: { session } } = await supabaseClient.auth.getSession();
          const token = session?.access_token;

          const r2 = await fetch("/api/regenerate-last", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ user_id: user.id, new_reply: reply })
          });

          if (!r2.ok) {
            const err = await r2.json().catch(() => ({}));
            console.warn("regenerate-last falló:", err);
            // fallback (duplica, pero no rompe)
            await saveMessageToSupabase({ userId: user.id, sender: "bot", content: reply });
          }

          // sonido (si existe)
          const yumikoSound = document.getElementById("yumiko-sound");
          if (yumikoSound) {
            yumikoSound.currentTime = 0;
            yumikoSound.play();
          }
        } catch (e) {
          console.warn(e);
          addMessage("Hubo un error al regenerar la respuesta.", "bot");
        } finally {
          typing?.classList.add("hidden");
        }
      };
    }

    // REINICIAR CHAT: borra DB via /api/reset-chat y limpia UI
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const typing = document.getElementById("typing");
        typing?.classList.remove("hidden");

        try {
          // 1) Borrado real en DB
          const { data: { session } } = await supabaseClient.auth.getSession();
          const token = session?.access_token;

          const r = await fetch("/api/reset-chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ user_id: user.id })
          });

          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.warn("reset-chat falló:", err);
          }

          // 2) Limpiar UI y estado local
          chatBox.innerHTML = "";
          lastUserText = null;

          // 3) Mensaje inicial (opcional)
          const hello = getRandomWelcomeMessage();
          addMessage(hello, "bot");
          await saveMessageToSupabase({ userId: user.id, sender: "bot", content: hello });
        } catch (e) {
          console.warn(e);
          addMessage("No pude reiniciar el chat por un error.", "bot");
        } finally {
          typing?.classList.add("hidden");
        }
      };
    }
  }
});

// ===============================
// INVENTARIO LATERAL (VERSIÓN GACHA)
// ===============================
function isChatPage() {
  const p = (window.location.pathname || "").toLowerCase();
  return p.endsWith("/index.html") || p === "/" || p.includes("index");
}

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

  content.innerHTML = items.map(i => {
    const rareza = i.rareza?.toLowerCase() || "comun";
    const color =
      rareza === "rara" ? "#4da6ff" :
      rareza === "epica" || rareza === "épica" ? "#c77dff" :
      rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

    return `
      <div class="inv-item">
        <img src="${i.imagen_url || '/varios/placeholder.png'}" class="inv-img">
        <div class="inv-info">
          <div class="inv-nombre" style="color:${color}">${i.nombre}</div>
          <div class="inv-detalle">
            ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad}
          </div>

          ${isChatPage() ? `
            <button class="inv-use-btn" data-skin-id="${i.skin_id}">
              Usar como fondo
            </button>
          ` : ``}
        </div>
      </div>
    `;
  }).join("");
// ===============================
// FONDO DE CHAT (SKINS)
// ===============================
function applyChatBackground(url) {
  const bg = document.getElementById("yumiko-bg");
  if (!bg) return;

  if (!url) {
    bg.style.backgroundImage = "";
    return;
  }

  bg.style.backgroundImage = `url("${url}")`;
  bg.style.backgroundSize = "cover";
  bg.style.backgroundPosition = "center";
  bg.style.opacity = "0.18";
}

async function setActiveSkinBackground(skinId) {
  if (!skinId) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const res = await fetch("/api/set-active-skin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: user.id,
      skin_id: skinId
    })
  });

  const data = await res.json();
  if (!res.ok) {
    console.warn("set-active-skin error:", data);
    return;
  }

  applyChatBackground(data.imagen_url);
}

// Hook de clicks (solo en index/chat)
if (isChatPage()) {
  content.querySelectorAll(".inv-use-btn").forEach(btn => {
    btn.onclick = async () => {
      const skinId = btn.getAttribute("data-skin-id");
      await setActiveSkinBackground(skinId);
      // opcional: cerrar inventario al elegir
      // document.getElementById("inventory-overlay")?.remove();
    };
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
