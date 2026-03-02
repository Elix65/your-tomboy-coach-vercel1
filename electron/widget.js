const STORAGE_KEY = 'yumiko_widget_settings_v1';
const DEFAULT_SETTINGS = {
  mode: 'focus',
  mute: false,
  frequency: 'normal'
};

const widget = document.getElementById('yumiko-widget');
const avatar = document.getElementById('yumiko-avatar');
const bubble = document.getElementById('yumiko-bubble');
const chat = document.getElementById('yumiko-chat');
const input = document.getElementById('yumiko-input');
const mic = document.getElementById('yumiko-mic');
const send = document.getElementById('yumiko-send');

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function notifyHostMode(mode) {
  if (window.yumikoOverlay?.setMode) {
    window.yumikoOverlay.setMode(mode);
  }
}

function setMode(nextMode) {
  const mode = nextMode === 'chat' ? 'chat' : 'focus';
  settings.mode = mode;
  saveSettings();

  if (!widget || !chat || !bubble) {
    return;
  }

  widget.dataset.mode = mode;
  chat.hidden = mode !== 'chat';
  bubble.textContent = mode === 'chat' ? 'Estoy escuchando 👀' : '¿Me contás qué hacés?';

  if (mode === 'chat') {
    input?.focus();
  } else {
    bubble?.focus();
  }

  notifyHostMode(mode);
}

function toggleMode() {
  setMode(settings.mode === 'focus' ? 'chat' : 'focus');
}

function submitMessage() {
  if (!input || !bubble) return;
  const value = input.value.trim();
  if (!value) return;
  bubble.textContent = `Yumiko: ${value.slice(0, 60)}`;
  input.value = '';
  setMode('focus');
}

function syncHostState(state = {}) {
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);

  if (state.mode && state.mode !== settings.mode) {
    setMode(state.mode);
  }
}

function bindTopBarActions() {
  toggleSettingsButton?.addEventListener('click', () => {
    settingsPanel?.classList.toggle('open');
  });

  quitAppButton?.addEventListener('click', () => {
    if (typeof window.yumikoOverlay?.quit === 'function') {
      window.yumikoOverlay.quit();
      return;
    }
    window.close();
  });

  overlayToggle?.addEventListener('change', () => {
    window.yumikoOverlay?.setOverlayEnabled?.(overlayToggle.checked);
  });

  clickThroughToggle?.addEventListener('change', () => {
    window.yumikoOverlay?.setClickThroughEnabled?.(clickThroughToggle.checked);
  });

  shortcutsToggle?.addEventListener('change', () => {
    window.yumikoOverlay?.setShortcutsEnabled?.(shortcutsToggle.checked);
  });
}

avatar?.addEventListener('click', toggleMode);
bubble?.addEventListener('click', () => setMode('chat'));
send?.addEventListener('click', submitMessage);

mic?.addEventListener('click', () => {
  settings.mute = !settings.mute;
  saveSettings();
  mic.textContent = settings.mute ? '🔇' : '🎤';
  mic.setAttribute('aria-label', settings.mute ? 'Micrófono desactivado' : 'Micrófono activado');
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') submitMessage();
  if (event.key === 'Escape') setMode('focus');
});

window.addEventListener('message', (event) => {
  const type = event?.data?.type;
  if (type === 'YUMIKO_SET_MODE') {
    setMode(event.data.mode);
  }
});

window.yumikoWidget = {
  setMode,
  getSettings: () => ({ ...settings })
};

bindTopBarActions();

if (window.yumikoOverlay?.onStateUpdated) {
  window.yumikoOverlay.onStateUpdated(syncHostState);
}

if (window.yumikoOverlay?.getState) {
  window.yumikoOverlay
    .getState()
    .then((state) => {
      syncHostState(state);
      if (state?.mode) {
        settings.mode = state.mode;
        saveSettings();
      }
      setMode(settings.mode);
    })
    .catch(() => setMode(settings.mode));
} else {
  setMode(settings.mode);
}

if (mic) {
  mic.textContent = settings.mute ? '🔇' : '🎤';
}
