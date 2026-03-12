import { appendToOverlayRoot } from "./overlayRoot.js";

const REWARDS_STORAGE_KEYS = {
  streakCount: "yumiko_streak_count",
  lastChatDate: "yumiko_last_chat_date",
  lastCountAttemptTs: "yumiko_last_count_attempt_ts"
};

// Ajuste rápido de assets del widget: cambia estas URLs si querés otros íconos.
const REWARDS_ASSETS = {
  gift: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/Gift-reward.png",
  lockClosed: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/candadito.png",
  lockOpen: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/candadito-abierto.png"
};

const MAX_STREAK_DAYS = 7;
// Anti-trampa: umbrales editables.
const MIN_VALID_MESSAGE_LENGTH = 8; // Cambiar este valor para ajustar largo mínimo.
const COUNT_ATTEMPT_COOLDOWN_MS = 10_000; // Cambiar este valor para ajustar rate-limit de intentos.

// CTA día 5: personalizá número y texto aquí.
const REWARD_CTA_DAY_THRESHOLD = 5;
const REWARD_WHATSAPP_NUMBER = "541144103647"; // <-- Cambiar número de WhatsApp.
const REWARD_WHATSAPP_MESSAGE = "Hola! Llegué al día 5 con Yumiko 😳 Quiero reclamar mi reward."; // <-- Cambiar texto del mensaje.

export function getTodayLocalYYYYMMDD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateFromYYYYMMDD(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year
    || localDate.getMonth() !== month - 1
    || localDate.getDate() !== day
  ) {
    return null;
  }

  return localDate;
}

export function isYesterdayLocal(dateStr) {
  const parsedDate = parseLocalDateFromYYYYMMDD(dateStr);
  if (!parsedDate) return false;

  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    parsedDate.getFullYear() === yesterday.getFullYear()
    && parsedDate.getMonth() === yesterday.getMonth()
    && parsedDate.getDate() === yesterday.getDate()
  );
}

export function isValidChatMessage(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length < MIN_VALID_MESSAGE_LENGTH) {
    return false;
  }

  // Debe contener al menos una letra o número (evita solo emojis/signos).
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function getStoredRewardsState() {
  const streakRaw = Number.parseInt(localStorage.getItem(REWARDS_STORAGE_KEYS.streakCount) || "0", 10);
  const lastChatDate = localStorage.getItem(REWARDS_STORAGE_KEYS.lastChatDate) || "";
  const lastCountAttemptTsRaw = Number.parseInt(localStorage.getItem(REWARDS_STORAGE_KEYS.lastCountAttemptTs) || "0", 10);

  return {
    streakCount: Number.isFinite(streakRaw) && streakRaw > 0 ? Math.min(streakRaw, MAX_STREAK_DAYS) : 0,
    lastChatDate,
    lastCountAttemptTs: Number.isFinite(lastCountAttemptTsRaw) && lastCountAttemptTsRaw > 0 ? lastCountAttemptTsRaw : 0
  };
}

function setStoredRewardsState(streakCount, lastChatDate, lastCountAttemptTs) {
  localStorage.setItem(REWARDS_STORAGE_KEYS.streakCount, String(Math.max(0, Math.min(streakCount, MAX_STREAK_DAYS))));
  localStorage.setItem(REWARDS_STORAGE_KEYS.lastChatDate, lastChatDate);
  if (Number.isFinite(lastCountAttemptTs) && lastCountAttemptTs > 0) {
    localStorage.setItem(REWARDS_STORAGE_KEYS.lastCountAttemptTs, String(lastCountAttemptTs));
  }
}

function openRewardWhatsAppCTA() {
  const encodedText = encodeURIComponent(REWARD_WHATSAPP_MESSAGE);
  const url = `https://wa.me/${REWARD_WHATSAPP_NUMBER}?text=${encodedText}`;
  window.open(url, "_blank", "noopener");
}

function ensureRewardsWidgetShell() {
  if (document.getElementById("daily-chat-rewards-widget")) {
    return;
  }

  const widget = document.createElement("aside");
  widget.id = "daily-chat-rewards-widget";
  widget.className = "daily-chat-rewards-widget";

  widget.innerHTML = `
    <div class="daily-chat-rewards-panel">
      <div class="daily-chat-rewards-content">
        <div class="daily-chat-rewards-main">
          <h3 class="daily-chat-rewards-title">Daily Chat Rewards</h3>
          <ul class="daily-chat-rewards-list" aria-live="polite"></ul>
          <p class="daily-chat-rewards-helper">Chat for 7 days in a row to unlock a special reward!</p>
        </div>

        <div class="daily-chat-reward-gift" id="daily-chat-reward-gift">
          <img src="${REWARDS_ASSETS.gift}" alt="Reward gift" class="daily-chat-reward-gift-image" />
          <span class="daily-chat-reward-gift-text">Reward!</span>
        </div>
      </div>
    </div>
  `;

  appendToOverlayRoot(widget);
}

export function renderRewardsWidget(streakCount = 0) {
  ensureRewardsWidgetShell();

  const normalizedStreak = Math.max(0, Math.min(Number(streakCount) || 0, MAX_STREAK_DAYS));
  const list = document.querySelector("#daily-chat-rewards-widget .daily-chat-rewards-list");
  const gift = document.getElementById("daily-chat-reward-gift");

  if (!list || !gift) {
    return;
  }

  list.innerHTML = "";

  for (let day = 1; day <= MAX_STREAK_DAYS; day += 1) {
    const isCompleted = day <= normalizedStreak;
    const item = document.createElement("li");
    item.className = "daily-chat-rewards-item";

    item.innerHTML = `
      <span class="daily-chat-rewards-item-left">
        <img src="${isCompleted ? REWARDS_ASSETS.lockOpen : REWARDS_ASSETS.lockClosed}" alt="${isCompleted ? "Unlocked" : "Locked"}" class="daily-chat-rewards-lock" />
        <span class="daily-chat-rewards-day">${day} ${day === 1 ? "Day" : "Days"}</span>
      </span>
      <span class="daily-chat-rewards-status ${isCompleted ? "is-completed" : ""}" aria-hidden="true">
        ${isCompleted ? "✓" : ""}
      </span>
    `;

    list.appendChild(item);
  }

  gift.classList.toggle("is-unlocked", normalizedStreak >= MAX_STREAK_DAYS);
  gift.classList.toggle("reward-cta-active", normalizedStreak >= REWARD_CTA_DAY_THRESHOLD);
  gift.style.cursor = normalizedStreak >= REWARD_CTA_DAY_THRESHOLD ? "pointer" : "default";
  gift.onclick = normalizedStreak >= REWARD_CTA_DAY_THRESHOLD ? openRewardWhatsAppCTA : null;
  gift.querySelector(".daily-chat-reward-gift-text").textContent = normalizedStreak >= MAX_STREAK_DAYS ? "Unlocked!" : "Reward!";
}

export function updateStreakOnMessageSend(messageText) {
  const nowTs = Date.now();
  const today = getTodayLocalYYYYMMDD();
  const {
    streakCount,
    lastChatDate,
    lastCountAttemptTs
  } = getStoredRewardsState();

  if (lastCountAttemptTs && (nowTs - lastCountAttemptTs) < COUNT_ATTEMPT_COOLDOWN_MS) {
    return streakCount;
  }

  setStoredRewardsState(streakCount, lastChatDate, nowTs);

  if (!isValidChatMessage(messageText)) {
    renderRewardsWidget(streakCount);
    return streakCount;
  }

  if (lastChatDate === today) {
    renderRewardsWidget(streakCount);
    return streakCount;
  }

  let nextStreak = 1;
  if (isYesterdayLocal(lastChatDate)) {
    nextStreak = streakCount + 1;
  }

  nextStreak = Math.min(nextStreak, MAX_STREAK_DAYS);
  setStoredRewardsState(nextStreak, today, nowTs);
  renderRewardsWidget(nextStreak);

  return nextStreak;
}

export function initRewardsWidget() {
  ensureRewardsWidgetShell();
  const { streakCount } = getStoredRewardsState();
  renderRewardsWidget(streakCount);
}
