const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');

const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');

const welcome = document.getElementById('welcome');
const welcomeOverlay = document.getElementById('welcome-overlay');
const welcomeShortcuts = document.getElementById('welcome-shortcuts');
const welcomeClickThrough = document.getElementById('welcome-clickthrough');
const welcomeContinue = document.getElementById('welcome-continue');

const localWidget = document.getElementById('local-widget');
const localMode = document.getElementById('local-mode');
const localTitle = document.getElementById('local-title');
const yumikoImage = document.getElementById('yumiko-image');
const yumikoFallback = document.getElementById('yumiko-fallback');
const statusMessage = document.getElementById('status-message');

const YUMIKO_IMAGE_URL = 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/hi-4.png';

function applyLocalMode(mode) {
  const normalizedMode = mode === 'focus' ? 'focus' : 'chat';
  localWidget.dataset.mode = normalizedMode;
  localWidget.classList.toggle('focus', normalizedMode === 'focus');
  localMode.textContent = normalizedMode === 'focus' ? 'Modo focus' : 'Modo chat';
  localTitle.textContent = normalizedMode === 'focus'
    ? 'Yumiko está concentrada contigo…'
    : 'Yumiko está despertando…';
}

window.yumikoWidget = {
  setMode(mode) {
    applyLocalMode(mode);
  }
};

function syncUI(state) {
  overlayToggle.checked = Boolean(state.overlayEnabled);
  clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  shortcutsToggle.checked = Boolean(state.shortcutsEnabled);
  welcome.hidden = Boolean(state.hasCompletedFirstRun);
  applyLocalMode(state.mode);
}

async function completeWelcome() {
  try {
    await window.yumikoOverlay.completeFirstRun();
  } catch (error) {
    console.error('Failed to complete first run transition:', error);
  }

  window.location.href = 'index.html';
  welcome.hidden = true;
}

toggleSettingsButton.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

quitAppButton.addEventListener('click', () => {
  if (typeof window.yumikoOverlay?.closeWindow === 'function') {
    window.yumikoOverlay.closeWindow();
    return;
  }
  window.close();
});

overlayToggle.addEventListener('change', () => {
  window.yumikoOverlay.setOverlayEnabled(overlayToggle.checked);
});

clickThroughToggle.addEventListener('change', () => {
  window.yumikoOverlay.setClickThroughEnabled(clickThroughToggle.checked);
});

shortcutsToggle.addEventListener('change', () => {
  window.yumikoOverlay.setShortcutsEnabled(shortcutsToggle.checked);
});

welcomeOverlay.addEventListener('click', async () => {
  window.yumikoOverlay.setOverlayEnabled(true);
  await completeWelcome();
});

welcomeShortcuts.addEventListener('click', async () => {
  window.yumikoOverlay.setShortcutsEnabled(true);
  await completeWelcome();
});

welcomeClickThrough.addEventListener('click', async () => {
  window.yumikoOverlay.setClickThroughEnabled(true);
  await completeWelcome();
});

welcomeContinue.addEventListener('click', async () => {
  await completeWelcome();
});



function setSafeModeMessage(message) {
  statusMessage.textContent = `Estado: ${message}`;
}

function showSafeFallback(reason) {
  yumikoImage.hidden = true;
  yumikoFallback.classList.add('visible');
  setSafeModeMessage(`Modo seguro (${reason})`);
}

function renderYumikoImage() {
  yumikoImage.src = YUMIKO_IMAGE_URL;

  yumikoImage.addEventListener('load', () => {
    yumikoImage.hidden = false;
    yumikoFallback.classList.remove('visible');
    setSafeModeMessage('conectado.');
  });

  yumikoImage.addEventListener('error', () => {
    showSafeFallback('imagen no disponible');
  });
}

async function verifySafeMode() {
  try {
    const state = await window.yumikoOverlay.getState();
    syncUI(state);
  } catch {
    showSafeFallback('sin backend');
  }
}

renderYumikoImage();
verifySafeMode();
window.yumikoOverlay.onStateUpdated(syncUI);
