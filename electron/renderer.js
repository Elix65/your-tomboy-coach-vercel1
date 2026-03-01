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

function completeWelcome() {
  window.yumikoOverlay.completeFirstRun();
  welcome.hidden = true;
}

toggleSettingsButton.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

quitAppButton.addEventListener('click', () => {
  window.yumikoOverlay.quit();
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

welcomeOverlay.addEventListener('click', () => {
  window.yumikoOverlay.setOverlayEnabled(true);
  completeWelcome();
});

welcomeShortcuts.addEventListener('click', () => {
  window.yumikoOverlay.setShortcutsEnabled(true);
  completeWelcome();
});

welcomeClickThrough.addEventListener('click', () => {
  window.yumikoOverlay.setClickThroughEnabled(true);
  completeWelcome();
});

welcomeContinue.addEventListener('click', () => {
  completeWelcome();
});

window.yumikoOverlay.getState().then(syncUI);
window.yumikoOverlay.onStateUpdated(syncUI);
