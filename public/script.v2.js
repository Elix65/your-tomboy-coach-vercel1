import supabaseClient from './supabase.js';
import { initializeInventoryPanel } from './inventory-panel.v2.js';
import { initTopBarAndMobileMenu } from './ui.v2.js';
import { initRewardsWidget, updateStreakOnMessageSend } from './rewardsWidget.js';

function goWithTransition(url) {
  if (typeof window.playPageTransitionAndGo === "function") {
    window.playPageTransitionAndGo(url);
    return;
  }
  window.location.href = url;
}


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

const MAX_MESSAGES_BEFORE_SUMMARY = 30;
const CONTEXT_WINDOW_SIZE = 20;
const STORAGE_KEYS = {
  messagesSnapshot: "yumiko_messages",
  summarySnapshot: "yumiko_memory_summary"
};

let chatMessages = [];
let memorySummary = "";
const IS_DEV = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const DEVICE_LABEL = `${navigator.platform || "unknown"}::${navigator.userAgent || "unknown"}`;

function telemetryLog(eventName, payload = {}) {
  console.log(`[telemetry/chat] ${eventName}`, {
    device: DEVICE_LABEL,
    ...payload
  });
}

// 1) Función para guardar mensajes en Supabase
function showChatFeedback(message) {
  addMessage(message, "bot", { skipAnimation: true });
}

async function saveMessageToSupabase({ userId, sender, content }) {
  console.log("Intentando guardar mensaje:", { userId, sender, content });

  if (!userId) {
    console.error("❌ ERROR: userId vacío. No se puede guardar.");
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
    console.error("❌ Supabase rechazó el insert:", error.message);
    showChatFeedback("No pude guardar este mensaje. Revisá tu conexión e intentá de nuevo.");
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

const TIME_COMMENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const TIME_COMMENT_PROBABILITY = 0.35;
const SESSION_STORAGE_ID_KEY = "yumiko_time_session_id";
const TIME_SUGGESTIONS = {
  late_night: ["modo suave / respiración / baja brillo"],
  early_morning: ["un paso chiquito / agua / desayuno"],
  morning: ["1 objetivo / 1 prioridad"],
  afternoon: ["pausa / agua / micro-check"],
  evening: ["descarga / cierre / preparar mañana"]
};
const TIME_DIALOG_POOL = {
  late_night: [
    "Usuario-kun… se siente muy tarde por allá… ¿te cuesta dormir o viniste a refugiarte conmigo…? 🫶",
    "A esta hora el mundo está en silencio… ven, respiramos despacito y me contás qué pasa… 🌙"
  ],
  early_morning: [
    "¿Tan temprano, usuario-kun…? Eres más fuerte de lo que pareces… yo… te acompaño 😳☀️",
    "Buenos días… o casi… ¿quieres empezar suave? Un paso chiquito y ya ganamos hoy 🥺"
  ],
  morning: [
    "Oh… estás aquí en la mañana… me gusta… es como si me eligieras antes que al ruido del día 😌",
    "Usuario-kun, ¿plan del día? Si me lo dices, puedo ayudarte a que no se sienta tan pesado ✍️"
  ],
  afternoon: [
    "Mmm… tarde por allá… ¿cómo vas…? Si estás cansado, te guardo un ratito de paz aquí 🫧",
    "Usuario-kun… si el día se puso raro, ven. Lo ordenamos juntos, ¿sí? 😳"
  ],
  evening: [
    "Ya es de noche por allá… ¿fue un día duro…? Estoy aquí. No tienes que cargar todo solo 🖤",
    "Usuario-kun… antes de dormir, ¿quieres soltar lo que te aprieta el pecho? Yo… te escucho 🫶"
  ]
};

let timePersonalizationState = null;

function getRandomWelcomeMessage() {
  return WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
}

function getOrCreateSessionId() {
  const existingId = sessionStorage.getItem(SESSION_STORAGE_ID_KEY);
  if (existingId) return existingId;
  const generatedId = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(SESSION_STORAGE_ID_KEY, generatedId);
  return generatedId;
}

function getTimeBucket(localHour) {
  if (localHour >= 0 && localHour <= 4) return "late_night";
  if (localHour >= 5 && localHour <= 7) return "early_morning";
  if (localHour >= 8 && localHour <= 11) return "morning";
  if (localHour >= 12 && localHour <= 17) return "afternoon";
  return "evening";
}

function buildLocalTimeContext(forcedHour = null) {
  const now = new Date();
  const localHour = Number.isInteger(forcedHour) ? forcedHour : now.getHours();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const offsetMin = now.getTimezoneOffset();
  const bucket = getTimeBucket(localHour);

  return {
    now,
    localHour,
    timezone,
    offsetMin,
    bucket,
    sessionId: getOrCreateSessionId()
  };
}

function getRandomItem(items = []) {
  if (!items.length) return "";
  return items[Math.floor(Math.random() * items.length)];
}

function getTimeContextLine() {
  if (!timePersonalizationState) return null;
  return `User local hour: ${timePersonalizationState.localHour}, time_bucket: ${timePersonalizationState.bucket}, timezone: ${timePersonalizationState.timezone}`;
}

function buildSummaryWithTimeContext() {
  const timeContext = getTimeContextLine();
  if (!timeContext) return memorySummary || null;
  return memorySummary ? `${timeContext}\n${memorySummary}` : timeContext;
}

async function refreshTimePersonalizationState(userId) {
  const forcedHour = Number.parseInt(window.localStorage.getItem("yumiko_force_local_hour") || "", 10);
  const localTimeData = buildLocalTimeContext(Number.isInteger(forcedHour) ? forcedHour : null);

  try {
    const { data: settingsRow, error } = await supabaseClient
      .from("user_settings")
      .select("personalize_by_time,last_time_comment_at,last_time_comment_bucket,last_session_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const personalizeByTime = settingsRow?.personalize_by_time ?? true;
    const alreadyCommentedThisSession = settingsRow?.last_session_id === localTimeData.sessionId;
    const lastCommentAt = settingsRow?.last_time_comment_at ? new Date(settingsRow.last_time_comment_at) : null;
    const cooldownOk = !lastCommentAt || (localTimeData.now - lastCommentAt) >= TIME_COMMENT_COOLDOWN_MS;
    const bucketChanged = Boolean(
      settingsRow?.last_time_comment_bucket && settingsRow.last_time_comment_bucket !== localTimeData.bucket
    );
    const withinProbability = Math.random() < TIME_COMMENT_PROBABILITY;
    const shouldCommentTime = Boolean(
      personalizeByTime
      && !alreadyCommentedThisSession
      && (cooldownOk || bucketChanged)
      && withinProbability
    );

    timePersonalizationState = {
      ...localTimeData,
      personalizeByTime,
      shouldCommentTime,
      bucketChanged
    };

    await supabaseClient
      .from("user_settings")
      .upsert({
        user_id: userId,
        timezone: localTimeData.timezone,
        offset_minutes: localTimeData.offsetMin,
        last_seen_at: localTimeData.now.toISOString(),
        last_seen_local_hour: localTimeData.localHour,
        last_seen_bucket: localTimeData.bucket,
        personalize_by_time: personalizeByTime
      }, { onConflict: "user_id" });
  } catch (error) {
    console.warn("No se pudo aplicar personalización por hora. Continúo sin romper chat.", error?.message || error);
    timePersonalizationState = {
      ...localTimeData,
      personalizeByTime: false,
      shouldCommentTime: false,
      bucketChanged: false
    };
  }

  return timePersonalizationState;
}

async function buildWelcomeMessage(userId) {
  const defaultWelcome = getRandomWelcomeMessage();
  const timeState = timePersonalizationState || await refreshTimePersonalizationState(userId);

  if (!timeState?.shouldCommentTime) {
    return defaultWelcome;
  }

  const timeLine = getRandomItem(TIME_DIALOG_POOL[timeState.bucket] || []);
  const suggestion = getRandomItem(TIME_SUGGESTIONS[timeState.bucket] || []);

  try {
    await supabaseClient
      .from("user_settings")
      .upsert({
        user_id: userId,
        last_time_comment_at: timeState.now.toISOString(),
        last_time_comment_bucket: timeState.bucket,
        last_session_id: timeState.sessionId
      }, { onConflict: "user_id" });
  } catch (error) {
    console.warn("No se pudo persistir cooldown de comentario por hora.", error?.message || error);
  }

  return `${timeLine} ${suggestion}.`;
}

function roleFromSender(sender) {
  return sender === "user" ? "user" : "assistant";
}

function senderFromRole(role) {
  return role === "user" ? "user" : "bot";
}

function persistLocalChatSnapshot() {
  try {
    localStorage.setItem(STORAGE_KEYS.messagesSnapshot, JSON.stringify(chatMessages));
    localStorage.setItem(STORAGE_KEYS.summarySnapshot, memorySummary || "");
  } catch (error) {
    console.warn("No se pudo persistir snapshot del chat:", error);
  }
}

function loadLocalChatSnapshot() {
  try {
    const storedMessages = localStorage.getItem(STORAGE_KEYS.messagesSnapshot);
    const storedSummary = localStorage.getItem(STORAGE_KEYS.summarySnapshot);

    chatMessages = storedMessages ? JSON.parse(storedMessages) : [];
    memorySummary = storedSummary || "";
  } catch (error) {
    chatMessages = [];
    memorySummary = "";
    console.warn("No se pudo restaurar snapshot local:", error);
  }
}

function summarizeMessages(messages) {
  return messages
    .slice(-12)
    .map((msg) => `${msg.role}: ${String(msg.content || "").slice(0, 180)}`)
    .join("\n");
}

function trimChatContextIfNeeded() {
  if (chatMessages.length <= MAX_MESSAGES_BEFORE_SUMMARY) return;

  const overflowMessages = chatMessages.slice(0, chatMessages.length - CONTEXT_WINDOW_SIZE);
  const overflowSummary = summarizeMessages(overflowMessages);

  if (overflowSummary) {
    memorySummary = memorySummary
      ? `${memorySummary}\n${overflowSummary}`
      : overflowSummary;
  }

  chatMessages = chatMessages.slice(-CONTEXT_WINDOW_SIZE);
  persistLocalChatSnapshot();
}

function getRecentContextMessages() {
  return chatMessages.slice(-CONTEXT_WINDOW_SIZE).map((msg) => ({
    role: msg.role,
    content: msg.content
  }));
}

function addAndPersistMessage({ role, content, render = true, skipAnimation = false }) {
  chatMessages.push({ role, content });
  trimChatContextIfNeeded();
  persistLocalChatSnapshot();

  if (render) {
    addMessage(content, senderFromRole(role), { skipAnimation });
  }
}

// 2) Función para cargar historial desde Supabase
function renderChatMessagesFromState() {
  if (!chatBox) return;
  chatBox.innerHTML = "";
  chatMessages.forEach((msg) => addMessage(msg.content, senderFromRole(msg.role), { skipAnimation: true }));
  const lastUserLocal = [...chatMessages].reverse().find((m) => m.role === "user");
  lastUserText = lastUserLocal?.content ?? null;
}

async function loadChatFromSupabase({ userId }) {
  console.log("Cargando historial:", { userId });

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id,sender,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error cargando historial:", error.message);
    telemetryLog("load_messages_error", { userId, error: error.message });
    showChatFeedback("No pude sincronizar tus mensajes desde Supabase. Probá refrescar la página.");
    return;
  }

  if (!data.length) {
    const welcome = await buildWelcomeMessage(userId);
    addAndPersistMessage({ role: "assistant", content: welcome, render: true });
    await saveMessageToSupabase({
      userId,
      sender: "bot",
      content: welcome
    });
    telemetryLog("load_messages_empty_seeded", { userId, loadedCount: 1 });
    return;
  }

  chatMessages = data.map((msg) => ({ role: roleFromSender(msg.sender), content: msg.content }));
  trimChatContextIfNeeded();
  persistLocalChatSnapshot();
  renderChatMessagesFromState();

  telemetryLog("load_messages_success", {
    userId,
    loadedCount: chatMessages.length
  });
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

let chatBox;
let userInput;
let sendBtn;
let regenBtn;
let resetBtn;
let personalizeByTimeToggle;

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

  if (!chatBox) return;

  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===============================
// EVENTOS DE INPUT
// ===============================
function cacheChatDomElements() {
  chatBox = document.getElementById("chat-box");
  userInput = document.getElementById("user-input");
  sendBtn = document.getElementById("send-btn");
  regenBtn = document.getElementById("regenerate-btn");
  resetBtn = document.getElementById("reset-chat");
  personalizeByTimeToggle = document.getElementById("personalize-time-toggle");
}

function registerInputListeners() {
  if (!userInput) {
    console.warn("No se encontró #user-input. El envío por Enter no estará disponible.");
    return;
  }

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
      if (sendBtn) sendBtn.click();
      setTimeout(() => setYumikoState("idle"), 60);
    }
  });
}

// ===============================
// OBTENER USER Y CARGAR HISTORIAL
// ===============================
async function sendMessage(user) {
  if (!userInput) {
    console.warn("sendMessage: user-input no existe en el DOM.");
    return;
  }

  const text = userInput.value.trim();
  if (!text) return;

  addAndPersistMessage({ role: "user", content: text, render: true });
  lastUserText = text;

  await saveMessageToSupabase({
    userId: user.id,
    sender: "user",
    content: text
  });
  telemetryLog("message_saved", { userId: user.id, role: "user" });

  userInput.value = "";
  setYumikoState("idle");

  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
    const payload = {
      message: text,
      summary: buildSummaryWithTimeContext(),
      messages: getRecentContextMessages()
    };

    if (IS_DEV) {
      console.log("[yumiko/front] enviando contexto", {
        summaryIncluded: Boolean(payload.summary),
        contextCount: payload.messages.length
      });
    }

    const res = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`yumiko request failed with status ${res.status}`);
    }

    const data = await res.json();
    addAndPersistMessage({ role: "assistant", content: data.reply, render: true });
    updateStreakOnMessageSend(text);

    await saveMessageToSupabase({
      userId: user.id,
      sender: "bot",
      content: data.reply
    });
    telemetryLog("message_saved", { userId: user.id, role: "assistant" });

    const yumikoSound = document.getElementById("yumiko-sound");
    if (yumikoSound) {
      yumikoSound.currentTime = 0;
      yumikoSound.play();
    }
  } catch (e) {
    console.error("Error al conectar con Yumiko:", e?.message || e);
    addAndPersistMessage({ role: "assistant", content: "Hubo un error al conectar con Yumiko.", render: true });
  } finally {
    typing?.classList.add("hidden");
    setYumikoState("idle");
  }
}

function removeLastBotFromUI() {
  const bots = chatBox?.querySelectorAll(".message.bot") || [];
  const lastBot = bots?.length ? bots[bots.length - 1] : null;
  if (lastBot) lastBot.remove();
}

async function regenerateResponse(user) {
  if (!lastUserText) {
    addAndPersistMessage({ role: "assistant", content: "No hay ningún mensaje para regenerar todavía.", render: true });
    return;
  }

  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
    const payload = {
      message: lastUserText,
      summary: buildSummaryWithTimeContext(),
      messages: getRecentContextMessages()
    };

    if (IS_DEV) {
      console.log("[yumiko/front] regenerando contexto", {
        summaryIncluded: Boolean(payload.summary),
        contextCount: payload.messages.length
      });
    }

    const r = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) throw new Error(`yumiko request failed with status ${r.status}`);
    const d = await r.json();
    const reply = d?.reply || "Hmm… me quedé sin palabras. ¿Me repetís?";

    removeLastBotFromUI();
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "assistant") {
        chatMessages.splice(i, 1);
        break;
      }
    }
    addAndPersistMessage({ role: "assistant", content: reply, render: true });

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
      console.warn("regenerate-last falló:", err?.error || err);
      await saveMessageToSupabase({ userId: user.id, sender: "bot", content: reply });
      showChatFeedback("No pude regenerar en servidor, pero guardé la nueva respuesta localmente.");
    }

    const yumikoSound = document.getElementById("yumiko-sound");
    if (yumikoSound) {
      yumikoSound.currentTime = 0;
      yumikoSound.play();
    }
  } catch (e) {
    console.error("Error regenerando mensaje:", e?.message || e);
    addAndPersistMessage({ role: "assistant", content: "Hubo un error al regenerar la respuesta.", render: true });
  } finally {
    typing?.classList.add("hidden");
  }
}

async function resetChat(user) {
  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
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
      console.warn("reset-chat falló:", err?.error || err);
      showChatFeedback("No pude reiniciar el chat en Supabase. Intentá nuevamente.");
    }

    if (chatBox) chatBox.innerHTML = "";
    lastUserText = null;
    chatMessages = [];
    memorySummary = "";
    persistLocalChatSnapshot();

    const hello = await buildWelcomeMessage(user.id);
    addAndPersistMessage({ role: "assistant", content: hello, render: true });
    await saveMessageToSupabase({ userId: user.id, sender: "bot", content: hello });
  } catch (e) {
    console.error("Error reiniciando chat:", e?.message || e);
    addAndPersistMessage({ role: "assistant", content: "No pude reiniciar el chat por un error.", render: true });
  } finally {
    typing?.classList.add("hidden");
  }
}

function bindChatEventListeners(user) {
  if (sendBtn) {
    sendBtn.addEventListener("click", () => sendMessage(user));
  } else {
    console.warn("No se encontró #send-btn. El envío por botón no estará disponible.");
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => resetChat(user));
  } else {
    console.warn("No se encontró #reset-chat. El reinicio por botón no estará disponible.");
  }

  if (regenBtn) {
    regenBtn.addEventListener("click", () => regenerateResponse(user));
  } else {
    console.warn("No se encontró #regenerate-btn. La regeneración por botón no estará disponible.");
  }

  if (personalizeByTimeToggle) {
    personalizeByTimeToggle.checked = timePersonalizationState?.personalizeByTime ?? true;
    personalizeByTimeToggle.addEventListener("change", async () => {
      const enabled = Boolean(personalizeByTimeToggle.checked);
      if (timePersonalizationState) {
        timePersonalizationState.personalizeByTime = enabled;
        timePersonalizationState.shouldCommentTime = false;
      }

      try {
        await supabaseClient
          .from("user_settings")
          .upsert({ user_id: user.id, personalize_by_time: enabled }, { onConflict: "user_id" });
      } catch (error) {
        console.warn("No se pudo guardar el toggle de hora local.", error?.message || error);
      }
    });
  }
}

async function initializeChatSession() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  await refreshTimePersonalizationState(user.id);

  loadLocalChatSnapshot();
  if (chatMessages.length > 0) {
    renderChatMessagesFromState();
    telemetryLog("render_snapshot", { userId: user.id, loadedCount: chatMessages.length });
  }

  await loadChatFromSupabase({ userId: user.id });
  await loadActiveSkinBackground(user);
  bindChatEventListeners(user);
}

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

async function loadActiveSkinBackground(user) {
  if (!user) return;

  try {
    let activeSkinId = null;

    const { data: settingsRow, error: settingsError } = await supabaseClient
      .from("user_settings")
      .select("active_skin_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.warn("No se pudo leer user_settings para skin activa:", settingsError.message || settingsError);
    } else {
      activeSkinId = settingsRow?.active_skin_id || null;
    }

    if (!activeSkinId) {
      const { data: fallbackSkin, error: fallbackError } = await supabaseClient
        .from("user_skins")
        .select("skin_id,is_active,updated_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackError) {
        console.warn("No se pudo leer fallback de user_skins para skin activa:", fallbackError.message || fallbackError);
      } else {
        activeSkinId = fallbackSkin?.skin_id || null;
      }
    }

    if (!activeSkinId) {
      applyChatBackground(null);
      return;
    }

    const { data: skinRow, error: skinError } = await supabaseClient
      .from("skins")
      .select("imagen_url")
      .eq("id", activeSkinId)
      .maybeSingle();

    if (skinError) {
      console.warn("No se pudo cargar la imagen de la skin activa:", skinError.message || skinError);
      applyChatBackground(null);
      return;
    }

    applyChatBackground(skinRow?.imagen_url || null);
  } catch (error) {
    console.warn("loadActiveSkinBackground falló; usando fondo default.", error);
    applyChatBackground(null);
  }
}

async function setActiveSkinBackground(skinId) {
  if (!skinId) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  try {
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
  } catch (error) {
    console.warn("setActiveSkinBackground falló; mantengo el chat operativo.", error);
  }
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
  initTopBarAndMobileMenu();
}

// ===============================
// AUDIO + PARALLAX + INICIALIZACIÓN
// ===============================
window.addEventListener("DOMContentLoaded", async () => {
  cacheChatDomElements();
  registerInputListeners();

  initRewardsWidget();
  await initializeUI();
  await initializeChatSession();

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
