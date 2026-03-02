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
const yumikoWidgetContainer = document.getElementById('yumiko-widget');

function syncUI(state) {
  overlayToggle.checked = Boolean(state.overlayEnabled);
  clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  shortcutsToggle.checked = Boolean(state.shortcutsEnabled);
  const hasCompletedFirstRun = Boolean(state.hasCompletedFirstRun);
  welcome.hidden = hasCompletedFirstRun;
  if (yumikoWidgetContainer) {
    yumikoWidgetContainer.hidden = !hasCompletedFirstRun;
  }
}

async function completeWelcome() {
  welcome.hidden = true;
  if (yumikoWidgetContainer) {
    yumikoWidgetContainer.hidden = false;
  }

  try {
    await window.yumikoOverlay.completeFirstRun();
  } catch (error) {
    console.error('Failed to complete first run transition:', error);
  }
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

async function verifySafeMode() {
  try {
    const state = await window.yumikoOverlay.getState();
    syncUI(state);
  } catch {
    if (yumikoWidgetContainer) {
      yumikoWidgetContainer.hidden = false;
    }
  }
}

verifySafeMode();
window.yumikoOverlay.onStateUpdated(syncUI);

function showRuntimeError(errorLike) {
  const pre = document.createElement('pre');
  pre.style.position = 'fixed';
  pre.style.left = '10px';
  pre.style.right = '10px';
  pre.style.bottom = '10px';
  pre.style.maxHeight = '40vh';
  pre.style.overflow = 'auto';
  pre.style.padding = '10px';
  pre.style.borderRadius = '8px';
  pre.style.border = '1px solid #f66';
  pre.style.background = 'rgba(34, 0, 0, 0.92)';
  pre.style.color = '#ffd2d2';
  pre.style.zIndex = '10000';
  const message = errorLike instanceof Error
    ? `${errorLike.message}\n\n${errorLike.stack || ''}`
    : String(errorLike);
  pre.textContent = `Runtime error:\n${message}`;
  document.body.appendChild(pre);
}

window.onerror = (_message, _source, _lineno, _colno, error) => {
  showRuntimeError(error || _message);
};

window.addEventListener('unhandledrejection', (event) => {
  showRuntimeError(event.reason || 'Unhandled promise rejection');
});
