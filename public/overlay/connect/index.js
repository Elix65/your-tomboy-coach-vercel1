import supabaseClient from '/supabase.js';

const statusEl = document.getElementById('overlay-status');
const helpEl = document.getElementById('overlay-help');
const openBtn = document.getElementById('btn-open-deeplink');
const retryBtn = document.getElementById('btn-retry');
const loginBtn = document.getElementById('btn-login');
const tutorialEmbed = document.getElementById('tutorial-embed');
const tutorialPlaceholder = document.getElementById('tutorial-placeholder');

let currentDeepLink = null;
let lastStartError = null;
let fallbackTimer = null;
const tutorialUrl = (window.__YUMIKO_OVERLAY_TUTORIAL_URL__ || '').trim();

function setupTutorialCard() {
  if (!tutorialEmbed || !tutorialPlaceholder || !tutorialUrl) {
    return;
  }

  tutorialEmbed.src = tutorialUrl;
  tutorialEmbed.style.display = 'block';
  tutorialPlaceholder.classList.add('hidden');
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function showHelp(show) {
  if (helpEl) helpEl.classList.toggle('hidden', !show);
}

function openDeepLink() {
  if (!currentDeepLink) {
    setStatus(lastStartError || 'Todavía no tenemos un deep link listo.');
    return;
  }

  window.location.href = currentDeepLink;
}

function scheduleFallbackHelp() {
  if (fallbackTimer) {
    window.clearTimeout(fallbackTimer);
  }

  fallbackTimer = window.setTimeout(() => {
    showHelp(true);
    setStatus('No detectamos apertura automática. Probá el botón manual.');
  }, 1200);
}

function getLoginUrl() {
  const returnTo = encodeURIComponent('/overlay/connect');
  return `/login.html?returnTo=${returnTo}`;
}

async function startPairing() {
  showHelp(false);
  setStatus('Generando código de conexión…');

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    setStatus('Necesitás iniciar sesión para vincular Yumiko Overlay.');
    if (loginBtn) {
      loginBtn.classList.remove('hidden');
      loginBtn.setAttribute('href', getLoginUrl());
    }
    window.location.href = getLoginUrl();
    return;
  }

  if (loginBtn) loginBtn.classList.add('hidden');

  const response = await fetch('/api/overlay/link/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({})
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.deepLink) {
    const errorMessage = payload?.error || 'No pudimos iniciar la conexión de overlay.';
    lastStartError = errorMessage;
    throw new Error(errorMessage);
  }

  lastStartError = null;
  currentDeepLink = payload.deepLink;
  setStatus('Intentando abrir Yumiko Overlay…');
  openDeepLink();
  scheduleFallbackHelp();
}

openBtn?.addEventListener('click', () => {
  openDeepLink();
  scheduleFallbackHelp();
});

retryBtn?.addEventListener('click', async () => {
  try {
    await startPairing();
  } catch (error) {
    showHelp(true);
    setStatus(error?.message || 'Error al generar un nuevo código.');
  }
});

startPairing().catch((error) => {
  showHelp(true);
  setStatus(error?.message || 'No pudimos abrir el deep link automáticamente.');
});

setupTutorialCard();
