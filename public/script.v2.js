import supabaseClient from './supabase.js';
import { initializeInventoryPanel } from './inventory-panel.v2.js';

function goWithTransition(url) {
  if (typeof window.playPageTransitionAndGo === "function") {
    window.playPageTransitionAndGo(url);
    return;
  }
  window.location.href = url;
}



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
const btnAudios = document.getElementById("btn-audios");

if (btnGacha) {
  btnGacha.onclick = (event) => {
    event.preventDefault();
    goWithTransition("gacha.html");
  };
}

if (btnInventario) {
  btnInventario.setAttribute("aria-expanded", "false");
}

if (btnAudios) {
  btnAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";
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
const mAudios = document.getElementById("m-audios");

if (mInv) {
  mInv.setAttribute("aria-expanded", "false");
  mInv.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    toggleInventory();
  };
}

if (mGacha) {
  mGacha.onclick = (event) => {
    event.preventDefault();
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    goWithTransition("gacha.html");
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

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-transition='1']");
  if (!link) return;

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#")) return;

  event.preventDefault();
  goWithTransition(href);
});

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
const YUMIKO_IDLE_URL = "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/fase-1.png";
const YUMIKO_THINK_URL = "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/fase-2.png";

[YUMIKO_IDLE_URL, YUMIKO_THINK_URL].forEach((src) => {
  const preloadImg = new Image();
  preloadImg.src = src;
});

const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const regenBtn = document.getElementById("regenerate-btn");
const resetBtn = document.getElementById("reset-chat");

let lastUserText = null;

function setYumikoState(state) {
  const idle = document.getElementById("yumikoIdle");
  const thinking = document.getElementById("yumikoThinking");

  if (!idle || !thinking) return;

  if (state === "thinking") {
    idle.classList.remove("is-active");
    thinking.classList.add("is-active");
    return;
  }

  thinking.classList.remove("is-active");
  idle.classList.add("is-active");
}

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
  setYumikoState("idle");

  userInput.addEventListener("focus", () => setYumikoState("thinking"));

  userInput.addEventListener("input", () => {
    const hasText = String(userInput.value || "").trim().length > 0;
    setYumikoState(hasText ? "thinking" : "idle");
  });

  userInput.addEventListener("blur", () => {
    const hasText = String(userInput.value || "").trim().length > 0;
    if (!hasText) setYumikoState("idle");
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
      setTimeout(() => setYumikoState("idle"), 60);
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
      setYumikoState("idle");

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
      setYumikoState("idle");
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
// INVENTARIO (PANEL ANIMADO)
// ===============================
function isChatPage() {
  const p = (window.location.pathname || "").toLowerCase();
  return p.endsWith("/index.html") || p === "/" || p.includes("index");
}

const inventoryPanel = document.getElementById("inventoryPanel");
const inventoryDropdown = document.getElementById("inventoryDropdown");
const inventoryContent = document.getElementById("inventory-content");
const inventoryCloseBtn = document.getElementById("inventory-close-btn");

const inventoryController = initializeInventoryPanel({
  supabaseClient,
  btnInventario,
  mInventario: mInv,
  inventoryPanel,
  inventoryDropdown,
  inventoryContent,
  inventoryCloseBtn,
  isChatPage: isChatPage(),
  onUseSkin: setActiveSkinBackground,
  desktopIgnoreSelector: ".nav-inventory"
});

function toggleInventory() {
  inventoryController?.toggleInventoryPanel();
}

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

if (btnInventario) {
  btnInventario.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleInventory();
  });
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
