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
  summarySnapshot: "yumiko_memory_summary",
  audioMode: "yumiko_audio_mode_enabled"
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

function isAudioModeEnabled() {
  return localStorage.getItem(STORAGE_KEYS.audioMode) === "1";
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
const SESSION_NUDGE_STORAGE_KEY = "yumiko_session_nudges_v1";
const LAST_ACTIVITY_STORAGE_KEY = "yumiko_last_activity_at";
const GLOBAL_NUDGE_STORAGE_KEY = "yumiko_global_nudges_v1";
const HELLO_NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const REST_NUDGE_SOFT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const REST_NUDGE_STRONG_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TOMORROW_FOLLOWUP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_FOR_HELLO_MS = 2 * 60 * 60 * 1000;
const HELLO_NUDGE_PROBABILITY = 0.25;
const SOFT_REST_NUDGE_PROBABILITY = 0.35;
const HELLO_NUDGE_TEXT = "Usuario-kun… ¿hacemos un reset de 60 segundos? 😳\nInhalá 4… exhalá 6… tres veces.\nAhora decime solo una cosa: ¿hoy estás más ‘tenso’ o más ‘cansado’? 🫧";
const REST_NUDGE_SOFT_TEXT = "Usuario-kun… parece que ya llevamos un rato 😳 ¿Te sirve una pausa cortita de 10–15 min y volvemos? Yo me quedo aquí 🫶";
const REST_NUDGE_STRONG_TEXT = "Usuario-kun… se siente muy tarde por allá… No te echo, solo me preocupo 😢\nSi quieres, hacemos un cierre suave y cuando vuelvas me dices ‘volví’, ¿sí?";
const REST_NUDGE_REJECT_TEXT = "Está bien… me quedo contigo. Solo bajemos el ritmo: modo suave, ¿sí? 🫧";
const TIME_SUGGESTIONS = {
  late_night: ["modo suave / respiración / baja brillo"],
  early_morning: ["un paso chiquito / agua / desayuno"],
  morning: ["1 objetivo / 1 prioridad"],
  afternoon: ["pausa / agua / micro-check"],
  evening: ["descarga / cierre / preparar mañana"]
};
const TIME_DIALOG_POOL = {
  madrugada: [
    "Usuario-kun… ya es madrugada por allá… ¿te cuesta dormir o viniste a refugiarte conmigo…? 🫶",
    "Ya estamos en madrugada… ven, respiramos despacito y me contás qué pasa… 🌙"
  ],
  "mañana": [
    "¿Ya es mañana por allá, usuario-kun…? Eres más fuerte de lo que pareces… yo… te acompaño 😳☀️",
    "Buenos días… ¿querés empezar suave? Un paso chiquito y ya ganamos hoy 🥺"
  ],
  "mediodía": [
    "Oh… ya es mediodía por allá… me gusta… es como si me eligieras antes del caos 😌",
    "Usuario-kun, si ya es mediodía… ¿hacemos un mini plan para lo que queda del día? ✍️"
  ],
  tarde: [
    "Mmm… ya es tarde por allá… ¿cómo vas…? Si estás cansado, te guardo un ratito de paz aquí 🫧",
    "Usuario-kun… si ya va la tarde y el día se puso raro, ven. Lo ordenamos juntos, ¿sí? 😳"
  ],
  noche: [
    "Ya es noche por allá… ¿fue un día duro…? Estoy aquí. No tienes que cargar todo solo 🖤",
    "Usuario-kun… si ya es de noche, ¿querés soltar lo que te aprieta el pecho? Yo… te escucho 🫶"
  ],
  neutral: [
    "Mmm… por ahí es tarde o temprano por allá… pero acá estoy contigo, ¿sí? 🫶"
  ]
};

let timePersonalizationState = null;
let currentUserId = null;
let actionUser = null;
let userSettingsCache = null;
let sessionNudgeState = {
  session_started_at: Date.now(),
  messages_in_session: 0,
  suppress_rest_nudges_for_session: false,
  used_hello_nudge_this_session: false,
  hello_nudge_pending_response: false,
  rest_nudge_pending_response: false,
  soft_rest_nudge_shown_this_session: false,
  strong_rest_nudge_shown_this_session: false,
  hello_nudge_eligible_by_activity: false,
  initial_message_count: 0
};

function devNudgeLog(label, payload = {}) {
  if (!IS_DEV) return;
  console.log(`[yumiko/nudge] ${label}`, payload);
}

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

function getDayPart(hour) {
  if (hour >= 0 && hour <= 5) return "madrugada";
  if (hour >= 6 && hour <= 11) return "mañana";
  if (hour >= 12 && hour <= 14) return "mediodía";
  if (hour >= 15 && hour <= 18) return "tarde";
  if (hour >= 19 && hour <= 23) return "noche";
  return "neutral";
}

function buildLocalTimeContext(forcedHour = null) {
  try {
    const now = new Date();
    const hour = Number.isInteger(forcedHour) ? forcedHour : now.getHours();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    const offsetMin = now.getTimezoneOffset();
    const bucket = getTimeBucket(hour);
    const dayPart = getDayPart(hour);

    return {
      now,
      hour,
      dayPart,
      timezone,
      offsetMin,
      bucket,
      sessionId: getOrCreateSessionId(),
      usedFallback: false
    };
  } catch (error) {
    const now = new Date();
    return {
      now,
      hour: null,
      dayPart: "neutral",
      timezone: "unknown",
      offsetMin: 0,
      bucket: "afternoon",
      sessionId: getOrCreateSessionId(),
      usedFallback: true
    };
  }
}

function getRandomItem(items = []) {
  if (!items.length) return "";
  return items[Math.floor(Math.random() * items.length)];
}

function getTimeContextLine() {
  if (!timePersonalizationState) return null;
  return `day_part: ${timePersonalizationState.dayPart}, time_bucket: ${timePersonalizationState.bucket}`;
}

function persistSessionNudgeState() {
  try {
    sessionStorage.setItem(SESSION_NUDGE_STORAGE_KEY, JSON.stringify(sessionNudgeState));
  } catch (error) {
    devNudgeLog("session_state_persist_failed", { error: error?.message || error });
  }
}

function loadSessionNudgeState() {
  try {
    const stored = sessionStorage.getItem(SESSION_NUDGE_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    sessionNudgeState = {
      ...sessionNudgeState,
      ...parsed
    };
  } catch (error) {
    devNudgeLog("session_state_restore_failed", { error: error?.message || error });
  }
}

function loadGlobalNudgeState() {
  try {
    return JSON.parse(localStorage.getItem(GLOBAL_NUDGE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistGlobalNudgeState(nextState) {
  try {
    localStorage.setItem(GLOBAL_NUDGE_STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    devNudgeLog("global_state_persist_failed", { error: error?.message || error });
  }
}

function getLastActivityAt() {
  const raw = Number(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY));
  return Number.isFinite(raw) ? raw : null;
}

function markLastActivity(timestamp = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
  } catch (error) {
    devNudgeLog("last_activity_persist_failed", { error: error?.message || error });
  }
}

function isGreetingMessage(text = "") {
  const normalized = text.trim().toLowerCase();
  return /^(hola+|holi+|hello+|buenas+|buen día|buen dia|hey+|hi+|qué onda|que onda|wenas+)\b/.test(normalized);
}

function isDeclineMessage(text = "") {
  const normalized = text.trim().toLowerCase();
  return /^(no|nop|nah|paso|ahora no|prefiero no|no quiero)\b/.test(normalized);
}

async function updateUserSettingsNudgeTimestamps(updates = {}) {
  const hasKeys = Object.keys(updates).length > 0;
  if (!hasKeys || !currentUserId) return;

  const globalState = {
    ...loadGlobalNudgeState(),
    ...updates
  };
  persistGlobalNudgeState(globalState);

  try {
    await supabaseClient
      .from("user_settings")
      .upsert({ user_id: currentUserId, ...updates }, { onConflict: "user_id" });
    userSettingsCache = {
      ...(userSettingsCache || {}),
      ...updates
    };
  } catch (error) {
    devNudgeLog("user_settings_nudges_upsert_failed", { error: error?.message || error });
  }
}

function canUseCooldown(isoTimestamp, cooldownMs) {
  if (!isoTimestamp) return true;
  const parsed = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(parsed)) return true;
  return (Date.now() - parsed) >= cooldownMs;
}

function getMinutesInSession() {
  return Math.floor((Date.now() - Number(sessionNudgeState.session_started_at || Date.now())) / 60000);
}

async function maybeSendHelloNudge({ text, userId }) {
  const greeting = isGreetingMessage(text);
  const isFirstMessage = sessionNudgeState.messages_in_session <= 1;
  const eligibleByActivity = Boolean(sessionNudgeState.hello_nudge_eligible_by_activity);
  const eligibleEntry = isFirstMessage || eligibleByActivity;
  const lastHelloNudgeAt = userSettingsCache?.last_hello_nudge_at || loadGlobalNudgeState().last_hello_nudge_at;
  const cooldownOk = canUseCooldown(lastHelloNudgeAt, HELLO_NUDGE_COOLDOWN_MS);
  const probabilityOk = Math.random() < HELLO_NUDGE_PROBABILITY;

  if (!greeting || !eligibleEntry || sessionNudgeState.used_hello_nudge_this_session || !cooldownOk || !probabilityOk) {
    devNudgeLog("hello_nudge_skipped", { greeting, eligibleEntry, cooldownOk, probabilityOk });
    return false;
  }

  addAndPersistMessage({ role: "assistant", content: HELLO_NUDGE_TEXT, render: true });
  await saveMessageToSupabase({ userId, sender: "yumiko", content: HELLO_NUDGE_TEXT });

  const nowIso = new Date().toISOString();
  sessionNudgeState.used_hello_nudge_this_session = true;
  sessionNudgeState.hello_nudge_pending_response = true;
  persistSessionNudgeState();
  await updateUserSettingsNudgeTimestamps({ last_hello_nudge_at: nowIso });
  devNudgeLog("hello_nudge_sent", { nowIso, eligibleByActivity, isFirstMessage });
  return true;
}

async function maybeSendRestNudge({ userId }) {
  if (sessionNudgeState.suppress_rest_nudges_for_session) {
    return;
  }

  const minutesInSession = getMinutesInSession();
  const messageCount = Number(sessionNudgeState.messages_in_session || 0);
  const dayPart = timePersonalizationState?.dayPart || "neutral";

  const strongCandidate = dayPart === "madrugada" && (minutesInSession >= 60 || messageCount >= 80);
  if (strongCandidate && !sessionNudgeState.strong_rest_nudge_shown_this_session) {
    const globalNudgeState = loadGlobalNudgeState();
    const lastStrongAt = userSettingsCache?.last_strong_rest_nudge_at || globalNudgeState.last_strong_rest_nudge_at;
    const lastTomorrowAt = userSettingsCache?.last_tomorrow_followup_at || globalNudgeState.last_tomorrow_followup_at;
    if (canUseCooldown(lastStrongAt, REST_NUDGE_STRONG_COOLDOWN_MS) && canUseCooldown(lastTomorrowAt, TOMORROW_FOLLOWUP_COOLDOWN_MS)) {
      addAndPersistMessage({ role: "assistant", content: REST_NUDGE_STRONG_TEXT, render: true });
      await saveMessageToSupabase({ userId, sender: "yumiko", content: REST_NUDGE_STRONG_TEXT });
      sessionNudgeState.strong_rest_nudge_shown_this_session = true;
      sessionNudgeState.rest_nudge_pending_response = true;
      persistSessionNudgeState();
      const nowIso = new Date().toISOString();
      await updateUserSettingsNudgeTimestamps({
        last_strong_rest_nudge_at: nowIso,
        last_rest_nudge_at: nowIso,
        last_tomorrow_followup_at: nowIso
      });
      devNudgeLog("rest_nudge_strong_sent", { minutesInSession, messageCount });
      return;
    }
  }

  if (sessionNudgeState.soft_rest_nudge_shown_this_session) {
    return;
  }

  const signals = [
    dayPart === "noche" || dayPart === "madrugada",
    minutesInSession >= 25 || messageCount >= 30,
    false
  ];
  const softSignals = signals.filter(Boolean).length;
  const softCandidate = softSignals >= 2 && Math.random() < SOFT_REST_NUDGE_PROBABILITY;
  if (!softCandidate) {
    return;
  }

  const lastSoftAt = userSettingsCache?.last_rest_nudge_at || loadGlobalNudgeState().last_rest_nudge_at;
  if (!canUseCooldown(lastSoftAt, REST_NUDGE_SOFT_COOLDOWN_MS)) {
    return;
  }

  addAndPersistMessage({ role: "assistant", content: REST_NUDGE_SOFT_TEXT, render: true });
  await saveMessageToSupabase({ userId, sender: "yumiko", content: REST_NUDGE_SOFT_TEXT });
  sessionNudgeState.soft_rest_nudge_shown_this_session = true;
  sessionNudgeState.rest_nudge_pending_response = true;
  persistSessionNudgeState();

  const nowIso = new Date().toISOString();
  await updateUserSettingsNudgeTimestamps({ last_rest_nudge_at: nowIso });
  devNudgeLog("rest_nudge_soft_sent", { minutesInSession, messageCount, dayPart, softSignals });
}

function refreshRuntimeTimeContext() {
  const localTimeData = buildLocalTimeContext();
  if (!timePersonalizationState) {
    timePersonalizationState = {
      ...localTimeData,
      personalizeByTime: true,
      shouldCommentTime: false,
      bucketChanged: false
    };
    return;
  }

  timePersonalizationState = {
    ...timePersonalizationState,
    ...localTimeData
  };
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
      .select("personalize_by_time,last_time_comment_at,last_time_comment_bucket,last_session_id,last_hello_nudge_at,last_rest_nudge_at,last_strong_rest_nudge_at,last_tomorrow_followup_at")
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

    userSettingsCache = settingsRow || {};

    await supabaseClient
      .from("user_settings")
      .upsert({
        user_id: userId,
        timezone: localTimeData.timezone,
        offset_minutes: localTimeData.offsetMin,
        last_seen_at: localTimeData.now.toISOString(),
        last_seen_local_hour: localTimeData.hour,
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
    userSettingsCache = loadGlobalNudgeState();
  }

  return timePersonalizationState;
}

async function buildWelcomeMessage(userId) {
  const defaultWelcome = getRandomWelcomeMessage();
  const timeState = timePersonalizationState || await refreshTimePersonalizationState(userId);

  if (!timeState?.shouldCommentTime) {
    return defaultWelcome;
  }

  const timeLine = getRandomItem(TIME_DIALOG_POOL[timeState.dayPart] || TIME_DIALOG_POOL.neutral || []);
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

function initializeSessionNudgeState() {
  loadSessionNudgeState();
  const now = Date.now();
  const lastActivityAt = getLastActivityAt();
  const inactiveLongEnough = Boolean(lastActivityAt && (now - lastActivityAt) > INACTIVITY_FOR_HELLO_MS);

  sessionNudgeState.session_started_at = now;
  sessionNudgeState.messages_in_session = 0;
  sessionNudgeState.suppress_rest_nudges_for_session = false;
  sessionNudgeState.used_hello_nudge_this_session = false;
  sessionNudgeState.hello_nudge_pending_response = false;
  sessionNudgeState.rest_nudge_pending_response = false;
  sessionNudgeState.soft_rest_nudge_shown_this_session = false;
  sessionNudgeState.strong_rest_nudge_shown_this_session = false;
  sessionNudgeState.hello_nudge_eligible_by_activity = inactiveLongEnough;
  sessionNudgeState.initial_message_count = chatMessages.length;
  persistSessionNudgeState();
  devNudgeLog("session_nudge_initialized", {
    inactiveLongEnough,
    initialMessageCount: chatMessages.length
  });
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
  if (role === "user") {
    hasUserMessagedThisSession = true;
  }
  trimChatContextIfNeeded();
  persistLocalChatSnapshot();

  if (render) {
    addMessage(content, senderFromRole(role), { skipAnimation });
  }

  updateActionButtonsState();
}

// 2) Función para cargar historial desde Supabase
function renderChatMessagesFromState() {
  if (!chatBox) return;
  chatBox.innerHTML = "";
  chatMessages.forEach((msg) => addMessage(msg.content, senderFromRole(msg.role), {
    skipAnimation: true,
    audioUrl: msg.audioUrl || ""
  }));
  const lastUserLocal = [...chatMessages].reverse().find((m) => m.role === "user");
  lastUserText = lastUserLocal?.content ?? null;
}

async function loadChatFromSupabase({ userId }) {
  console.log("Cargando historial:", { userId });

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;

  const response = await fetch("/api/get-messages", {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error || `HTTP ${response.status}`;
    console.error("❌ Error cargando historial:", errorMessage);
    telemetryLog("load_messages_error", { userId, error: errorMessage });
    showChatFeedback("No pude sincronizar tus mensajes desde Supabase. Probá refrescar la página.");
    return;
  }

  const data = payload?.messages || [];

  if (!data.length) {
    const welcome = await buildWelcomeMessage(userId);
    addAndPersistMessage({ role: "assistant", content: welcome, render: true });
    await saveMessageToSupabase({
      userId,
      sender: "yumiko",
      content: welcome
    });
    telemetryLog("load_messages_empty_seeded", { userId, loadedCount: 1 });
    return;
  }

  chatMessages = data.map((msg) => ({
    role: roleFromSender(msg.sender),
    content: msg.content,
    audioUrl: msg.audio_url || ""
  }));
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
let recordBtn;
let regenBtn;
let resetBtn;
let personalizeByTimeToggle;
let audioModeToggle;

let lastUserText = null;
let lastSendAt = 0;
let lastRegenAt = 0;
let lastResetAt = 0;
let hasUserMessagedThisSession = false;
let isSending = false;
let isRegenerating = false;
let isResetting = false;
let isRecording = false;
let mediaRecorder = null;
let recordingStream = null;
let recordedChunks = [];

const SEND_COOLDOWN_MS = 1200;
const RESET_COOLDOWN_MS = 2000;
const REGEN_COOLDOWN_MS = 2000;

const BUTTON_LABELS = {
  send: "Enviar",
  sendCooldown: "Espera…",
  regen: "Regenerar",
  regenCooldown: "Espera 2s…",
  reset: "Reiniciar Chat",
  resetCooldown: "Espera…"
};

function canRun(lastAt, cooldownMs) {
  return Date.now() - lastAt >= cooldownMs;
}

function hasRegenerableAssistantMessage() {
  if (!lastUserText) return false;
  const lastMessage = chatMessages[chatMessages.length - 1];
  return Boolean(lastMessage && lastMessage.role === "assistant");
}

function updateActionButtonsState() {
  const now = Date.now();

  if (sendBtn) {
    const sendOnCooldown = now - lastSendAt < SEND_COOLDOWN_MS;
    sendBtn.disabled = isSending || isRecording || sendOnCooldown;
    sendBtn.textContent = sendOnCooldown ? BUTTON_LABELS.sendCooldown : BUTTON_LABELS.send;
  }

  if (recordBtn) {
    recordBtn.disabled = isSending;
    recordBtn.textContent = isRecording ? "🎙️ Grabando…" : "🎙️ Mantener";
  }

  if (resetBtn) {
    const resetOnCooldown = now - lastResetAt < RESET_COOLDOWN_MS;
    const canReset = hasUserMessagedThisSession;
    resetBtn.disabled = isResetting || resetOnCooldown || !canReset;
    resetBtn.textContent = resetOnCooldown ? BUTTON_LABELS.resetCooldown : BUTTON_LABELS.reset;
    if (!canReset) {
      resetBtn.title = "Envía al menos 1 mensaje antes de reiniciar el chat.";
    } else {
      resetBtn.removeAttribute("title");
    }
  }

  if (regenBtn) {
    const regenOnCooldown = now - lastRegenAt < REGEN_COOLDOWN_MS;
    regenBtn.disabled = isRegenerating || regenOnCooldown || !hasRegenerableAssistantMessage();
    regenBtn.textContent = regenOnCooldown ? BUTTON_LABELS.regenCooldown : BUTTON_LABELS.regen;
  }
}

function scheduleCooldownRefresh(cooldownMs) {
  window.setTimeout(updateActionButtonsState, cooldownMs + 40);
}

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
  const { skipAnimation = false, audioUrl = "" } = options;
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

  if (audioUrl) {
    const textNode = document.createElement("p");
    textNode.textContent = text;
    textNode.style.margin = "0 0 8px 0";
    bubble.appendChild(textNode);

    const audioEl = document.createElement("audio");
    audioEl.controls = true;
    audioEl.preload = "none";
    audioEl.src = audioUrl;
    bubble.appendChild(audioEl);

    const listenBtn = document.createElement("button");
    listenBtn.type = "button";
    listenBtn.textContent = "▶️ Escuchar";
    listenBtn.style.marginTop = "8px";
    listenBtn.addEventListener("click", () => {
      audioEl.play().catch(() => {});
    });
    bubble.appendChild(listenBtn);
  } else {
    bubble.textContent = text;
  }

  if (!chatBox) return;

  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}


function addAudioMessage({ sender = "user", text = "", audioUrl = "", skipAnimation = false }) {
  const msg = document.createElement("div");
  const visualSender = sender === "yumiko" ? "bot" : sender;
  msg.classList.add("message", visualSender);

  const bubble = document.createElement("div");
  bubble.classList.add("bubble", "chat-bubble");

  if (visualSender === "bot") {
    bubble.classList.add("yumiko-bubble");
    if (!skipAnimation) {
      bubble.classList.add("yumiko-enter");
      bubble.addEventListener("animationend", () => bubble.classList.remove("yumiko-enter"), { once: true });
    }
  }

  if (text) {
    const textNode = document.createElement("p");
    textNode.textContent = text;
    textNode.style.margin = "0 0 8px 0";
    bubble.appendChild(textNode);
  }

  if (audioUrl) {
    const audioEl = document.createElement("audio");
    audioEl.controls = true;
    audioEl.src = audioUrl;
    audioEl.preload = "metadata";
    bubble.appendChild(audioEl);
  }

  if (!chatBox) return;

  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function startRecording() {
  if (isSending || isRecording) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingStream = stream;
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    isRecording = true;
    updateActionButtonsState();
  } catch (error) {
    console.error("No se pudo iniciar la grabación:", error?.message || error);
    showChatFeedback("No pude acceder al micrófono. Revisá permisos.");
  }
}

async function stopRecordingAndSend() {
  if (!isRecording || !mediaRecorder) return;

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });

  recordingStream?.getTracks().forEach((track) => track.stop());
  recordingStream = null;
  isRecording = false;
  updateActionButtonsState();

  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  recordedChunks = [];

  if (!blob.size || !actionUser) return;

  await sendVoiceMessage(actionUser, blob);
}

async function sendVoiceMessage(user, audioBlob) {
  if (isSending) return;

  isSending = true;
  updateActionButtonsState();
  setYumikoState("thinking");

  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("No access token");

    const formData = new FormData();
    formData.append("audio", audioBlob, "voice-message.webm");

    const response = await fetch("/api/voice-message", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`voice-message failed with status ${response.status}`);
    }

    const data = await response.json();

    addAndPersistMessage({ role: "user", content: data.transcript || "🎙️ Audio enviado", render: false });
    addAudioMessage({ sender: "user", audioUrl: data.audio_in_signed_url, text: data.transcript || "" });

    addAndPersistMessage({ role: "assistant", content: data.reply_text || "", render: false });
    addAudioMessage({ sender: "yumiko", text: data.reply_text || "", audioUrl: data.audio_out_signed_url });

    try {
      const autoAudio = chatBox?.querySelector(".message.bot:last-child audio");
      await autoAudio?.play();
    } catch (err) {
      console.warn("Autoplay bloqueado por el navegador.");
    }

    updateStreakOnMessageSend(data.transcript || "[voice]");
  } catch (error) {
    console.error("Error enviando audio:", error?.message || error);
    showChatFeedback("Hubo un error enviando el audio.");
  } finally {
    typing?.classList.add("hidden");
    setYumikoState("idle");
    isSending = false;
    updateActionButtonsState();
  }
}

// ===============================
// EVENTOS DE INPUT
// ===============================
function cacheChatDomElements() {
  chatBox = document.getElementById("chat-box");
  userInput = document.getElementById("user-input");
  sendBtn = document.getElementById("send-btn");
  recordBtn = document.getElementById("record-btn");
  regenBtn = document.getElementById("regenerate-btn");
  resetBtn = document.getElementById("reset-chat");
  personalizeByTimeToggle = document.getElementById("personalize-time-toggle");
  audioModeToggle = document.getElementById("audio-mode-toggle");
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

  userInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      try {
        await handleSendAction();
      } catch (error) {
        console.error("Error manejando Enter en envío:", error?.message || error);
      }
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

  if (isSending) return;
  if (!canRun(lastSendAt, SEND_COOLDOWN_MS)) {
    console.log("[chat] envío bloqueado por cooldown");
    updateActionButtonsState();
    return;
  }

  isSending = true;
  lastSendAt = Date.now();
  updateActionButtonsState();
  scheduleCooldownRefresh(SEND_COOLDOWN_MS);

  sessionNudgeState.messages_in_session += 1;
  persistSessionNudgeState();

  addAndPersistMessage({ role: "user", content: text, render: true });
  lastUserText = text;
  markLastActivity();

  await saveMessageToSupabase({
    userId: user.id,
    sender: "user",
    content: text
  });
  telemetryLog("message_saved", { userId: user.id, role: "user" });

  if ((sessionNudgeState.hello_nudge_pending_response || sessionNudgeState.rest_nudge_pending_response) && isDeclineMessage(text)) {
    sessionNudgeState.suppress_rest_nudges_for_session = true;
    sessionNudgeState.hello_nudge_pending_response = false;
    sessionNudgeState.rest_nudge_pending_response = false;
    persistSessionNudgeState();
    addAndPersistMessage({ role: "assistant", content: REST_NUDGE_REJECT_TEXT, render: true });
    await saveMessageToSupabase({ userId: user.id, sender: "yumiko", content: REST_NUDGE_REJECT_TEXT });
    devNudgeLog("rest_nudge_rejected_by_user", { reason: "declined_after_nudge" });
  } else if (sessionNudgeState.hello_nudge_pending_response || sessionNudgeState.rest_nudge_pending_response) {
    sessionNudgeState.hello_nudge_pending_response = false;
    sessionNudgeState.rest_nudge_pending_response = false;
    persistSessionNudgeState();
  }

  const helloNudgeSent = await maybeSendHelloNudge({ text, userId: user.id });
  if (helloNudgeSent) {
    markLastActivity();
    userInput.value = "";
    setYumikoState("idle");
    isSending = false;
    updateActionButtonsState();
    return;
  }

  userInput.value = "";
  setYumikoState("idle");

  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
    refreshRuntimeTimeContext();
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    const audioMode = Boolean(audioModeToggle?.checked);

    const payload = {
      message: text,
      audio_mode: audioMode,
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
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`yumiko request failed with status ${res.status}`);
    }

    const data = await res.json();
    addAndPersistMessage({ role: "assistant", content: data.reply, render: false });
    addMessage(data.reply, "bot", {
      audioUrl: data.audio_out_signed_url || ""
    });
    updateStreakOnMessageSend(text);

    if (!data?.yumiko_message_id) {
      await saveMessageToSupabase({
        userId: user.id,
        sender: "yumiko",
        content: data.reply
      });
      telemetryLog("message_saved", { userId: user.id, role: "assistant" });
    }

    await maybeSendRestNudge({ userId: user.id });

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
    markLastActivity();
    isSending = false;
    updateActionButtonsState();
  }
}

function removeLastBotFromUI() {
  const bots = chatBox?.querySelectorAll(".message.bot") || [];
  const lastBot = bots?.length ? bots[bots.length - 1] : null;
  if (lastBot) lastBot.remove();
}

async function regenerateResponse(user) {
  if (!hasRegenerableAssistantMessage()) {
    addAndPersistMessage({ role: "assistant", content: "No hay ningún mensaje para regenerar todavía.", render: true });
    return;
  }

  if (isRegenerating) return;
  if (!canRun(lastRegenAt, REGEN_COOLDOWN_MS)) {
    console.log("[chat] regenerar bloqueado por cooldown");
    updateActionButtonsState();
    return;
  }

  isRegenerating = true;
  lastRegenAt = Date.now();
  updateActionButtonsState();
  scheduleCooldownRefresh(REGEN_COOLDOWN_MS);

  const typing = document.getElementById("typing");
  typing?.classList.remove("hidden");

  try {
    refreshRuntimeTimeContext();
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;

    const payload = {
      message: lastUserText,
      audio_mode: false,
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
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
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
    addAndPersistMessage({ role: "assistant", content: reply, render: false });
    addMessage(reply, "bot", { audioUrl: d?.audio_out_signed_url || "" });


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
      await saveMessageToSupabase({ userId: user.id, sender: "yumiko", content: reply });
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
    isRegenerating = false;
    updateActionButtonsState();
  }
}

async function handleSendAction() {
  if (!actionUser) return;
  try {
    await sendMessage(actionUser);
  } catch (error) {
    console.error("Error ejecutando envío:", error?.message || error);
  }
}

async function handleResetAction() {
  if (!actionUser) return;
  try {
    await resetChat(actionUser);
  } catch (error) {
    console.error("Error ejecutando reset:", error?.message || error);
  }
}

async function handleRegenerateAction() {
  if (!actionUser) return;
  try {
    await regenerateResponse(actionUser);
  } catch (error) {
    console.error("Error ejecutando regeneración:", error?.message || error);
  }
}

async function resetChat(user) {
  if (!hasUserMessagedThisSession) {
    console.log("[chat] reset bloqueado: no hay mensajes del usuario en esta sesión");
    updateActionButtonsState();
    return;
  }

  if (isResetting) return;
  if (!canRun(lastResetAt, RESET_COOLDOWN_MS)) {
    console.log("[chat] reset bloqueado por cooldown");
    updateActionButtonsState();
    return;
  }

  isResetting = true;
  lastResetAt = Date.now();
  updateActionButtonsState();
  scheduleCooldownRefresh(RESET_COOLDOWN_MS);

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
    hasUserMessagedThisSession = false;
    persistLocalChatSnapshot();

    const hello = await buildWelcomeMessage(user.id);
    addAndPersistMessage({ role: "assistant", content: hello, render: true });
    await saveMessageToSupabase({ userId: user.id, sender: "yumiko", content: hello });
  } catch (e) {
    console.error("Error reiniciando chat:", e?.message || e);
    addAndPersistMessage({ role: "assistant", content: "No pude reiniciar el chat por un error.", render: true });
  } finally {
    typing?.classList.add("hidden");
    isResetting = false;
    updateActionButtonsState();
  }
}

function bindChatEventListeners(user) {
  actionUser = user;

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      await handleSendAction();
    });
  } else {
    console.warn("No se encontró #send-btn. El envío por botón no estará disponible.");
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      await handleResetAction();
    });
  } else {
    console.warn("No se encontró #reset-chat. El reinicio por botón no estará disponible.");
  }

  if (regenBtn) {
    regenBtn.addEventListener("click", async () => {
      await handleRegenerateAction();
    });
  } else {
    console.warn("No se encontró #regenerate-btn. La regeneración por botón no estará disponible.");
  }

  if (recordBtn) {
    const startEvents = ["mousedown", "touchstart"];
    const endEvents = ["mouseup", "mouseleave", "touchend", "touchcancel"];

    startEvents.forEach((eventName) => {
      recordBtn.addEventListener(eventName, async (event) => {
        event.preventDefault();
        await startRecording();
      });
    });

    endEvents.forEach((eventName) => {
      recordBtn.addEventListener(eventName, async (event) => {
        event.preventDefault();
        await stopRecordingAndSend();
      });
    });
  } else {
    console.warn("No se encontró #record-btn. La grabación no estará disponible.");
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

  if (audioModeToggle) {
    audioModeToggle.checked = isAudioModeEnabled();
    audioModeToggle.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEYS.audioMode, audioModeToggle.checked ? "1" : "0");
    });
  }

  updateActionButtonsState();
}

async function initializeChatSession() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  currentUserId = user.id;
  await refreshTimePersonalizationState(user.id);

  loadLocalChatSnapshot();
  initializeSessionNudgeState();
  if (chatMessages.length > 0) {
    renderChatMessagesFromState();
    telemetryLog("render_snapshot", { userId: user.id, loadedCount: chatMessages.length });
  }

  await loadChatFromSupabase({ userId: user.id });
  markLastActivity();
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

function makeRewardsWidgetCollapsible() {
  const widget = document.getElementById("daily-chat-rewards-widget");
  if (!widget) return;

  const COLLAPSED_STORAGE_KEY = "dailyRewardsCollapsed";
  const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";

  let wrapper = widget.closest(".rewards-collapsible");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "rewards-collapsible";
    widget.parentNode.insertBefore(wrapper, widget);
    wrapper.appendChild(widget);
  }

  let collapseBtn = wrapper.querySelector(".rewards-collapse-btn");
  if (!collapseBtn) {
    collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "rewards-collapse-btn";
    collapseBtn.textContent = "✕";
    wrapper.appendChild(collapseBtn);
  }

  let handleBtn = wrapper.querySelector(".rewards-handle-btn");
  if (!handleBtn) {
    handleBtn = document.createElement("button");
    handleBtn.type = "button";
    handleBtn.className = "rewards-handle-btn";
    handleBtn.textContent = "🎁";
    wrapper.appendChild(handleBtn);
  }

  const setCollapsed = (collapsed, { persist = true } = {}) => {
    wrapper.classList.toggle("is-collapsed", collapsed);
    widget.classList.toggle("is-hidden", collapsed);

    collapseBtn.setAttribute("aria-controls", widget.id);
    handleBtn.setAttribute("aria-controls", widget.id);
    collapseBtn.setAttribute("aria-expanded", String(!collapsed));
    handleBtn.setAttribute("aria-expanded", String(!collapsed));

    if (persist) {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    }
  };

  const syncDesktopPlacement = () => {
    const isMobile = window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
    if (!isMobile && widget.parentNode !== wrapper) {
      wrapper.appendChild(widget);
    }
  };

  collapseBtn.onclick = () => setCollapsed(true);
  handleBtn.onclick = () => setCollapsed(false);

  const savedState = localStorage.getItem(COLLAPSED_STORAGE_KEY);
  setCollapsed(savedState === "1", { persist: false });

  syncDesktopPlacement();
  window.addEventListener("resize", syncDesktopPlacement);
}

// ===============================
// AUDIO + PARALLAX + INICIALIZACIÓN
// ===============================
window.addEventListener("DOMContentLoaded", async () => {
  cacheChatDomElements();
  registerInputListeners();
  updateActionButtonsState();

  initRewardsWidget();
  makeRewardsWidgetCollapsible();
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
