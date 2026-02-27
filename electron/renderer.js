const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');

const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');

const welcome = document.getElementById('welcome');
const welcomeOverlay = document.getElementById('welcome-overlay');
const welcomeShortcuts = document.getElementById('welcome-shortcuts');
const welcomeClickThrough = document.getElementById('welcome-clickthrough');
const welcomeContinue = document.getElementById('welcome-continue');

function syncUI(state) {
  overlayToggle.checked = Boolean(state.overlayEnabled);
  clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  shortcutsToggle.checked = Boolean(state.shortcutsEnabled);
  welcome.hidden = Boolean(state.hasCompletedFirstRun);
}

function completeWelcome() {
  window.yumikoOverlay.completeFirstRun();
  welcome.hidden = true;
}

toggleSettingsButton.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
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
