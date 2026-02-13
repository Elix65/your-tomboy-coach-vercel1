const REWARDS_STORAGE_KEYS = {
  streakCount: "dailyChatRewards_streakCount",
  lastChatDate: "dailyChatRewards_lastChatDate"
};

// Ajuste rápido de assets del widget: cambia estas URLs si querés otros íconos.
const REWARDS_ASSETS = {
  gift: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/Gift-reward.png",
  lockClosed: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/candadito.png",
  lockOpen: "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/candadito-abierto.png"
};

const MAX_STREAK_DAYS = 7;

function getTodayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayISODate() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

function getStoredRewardsState() {
  const streakRaw = Number.parseInt(localStorage.getItem(REWARDS_STORAGE_KEYS.streakCount) || "0", 10);
  const lastChatDate = localStorage.getItem(REWARDS_STORAGE_KEYS.lastChatDate) || "";

  return {
    streakCount: Number.isFinite(streakRaw) && streakRaw > 0 ? Math.min(streakRaw, MAX_STREAK_DAYS) : 0,
    lastChatDate
  };
}

function setStoredRewardsState(streakCount, lastChatDate) {
  localStorage.setItem(REWARDS_STORAGE_KEYS.streakCount, String(Math.max(0, Math.min(streakCount, MAX_STREAK_DAYS))));
  localStorage.setItem(REWARDS_STORAGE_KEYS.lastChatDate, lastChatDate);
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
      <h3 class="daily-chat-rewards-title">Daily Chat Rewards</h3>
      <div class="daily-chat-rewards-content">
        <ul class="daily-chat-rewards-list" aria-live="polite"></ul>

        <div class="daily-chat-reward-gift" id="daily-chat-reward-gift">
          <img src="${REWARDS_ASSETS.gift}" alt="Reward gift" class="daily-chat-reward-gift-image" />
          <span class="daily-chat-reward-gift-text">Reward!</span>
        </div>
      </div>
      <p class="daily-chat-rewards-helper">Chat for 7 days in a row to unlock a special reward!</p>
    </div>
  `;

  document.body.appendChild(widget);
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
  gift.querySelector(".daily-chat-reward-gift-text").textContent = normalizedStreak >= MAX_STREAK_DAYS ? "Unlocked!" : "Reward!";
}

export function updateStreakOnMessageSend() {
  const today = getTodayISODate();
  const yesterday = getYesterdayISODate();
  const { streakCount, lastChatDate } = getStoredRewardsState();

  if (lastChatDate === today) {
    renderRewardsWidget(streakCount);
    return streakCount;
  }

  let nextStreak = 1;
  if (lastChatDate === yesterday) {
    nextStreak = streakCount + 1;
  }

  nextStreak = Math.min(nextStreak, MAX_STREAK_DAYS);
  setStoredRewardsState(nextStreak, today);
  renderRewardsWidget(nextStreak);

  return nextStreak;
}

export function initRewardsWidget() {
  ensureRewardsWidgetShell();
  const { streakCount } = getStoredRewardsState();
  renderRewardsWidget(streakCount);
}
