import supabaseClient from '/supabase.js';

const statusEl = document.getElementById('overlay-status');
const helpEl = document.getElementById('overlay-help');
const downloadBtn = document.getElementById('btn-download-overlay');
const githubBtn = document.getElementById('btn-view-github');
const openBtn = document.getElementById('btn-open-deeplink');
const retryBtn = document.getElementById('btn-retry');
const loginBtn = document.getElementById('btn-login');
const tutorialEmbed = document.getElementById('tutorial-embed');
const tutorialPlaceholder = document.getElementById('tutorial-placeholder');

let currentDeepLink = null;
let lastStartError = null;
let fallbackTimer = null;
const tutorialUrl = (window.__YUMIKO_OVERLAY_TUTORIAL_URL__ || '').trim();
const DOWNLOAD_URL = 'https://github.com/Elix65/your-tomboy-coach-vercel1/releases/latest/download/Yumiko-Overlay-Setup.exe';
const GITHUB_REPO_URL = 'https://github.com/Elix65/your-tomboy-coach-vercel1';

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
    setStatus('Si no se abrió Yumiko Overlay, probá nuevamente con el botón “Abrir Overlay”.');
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
  setStatus('Código listo. Cuando quieras, abrí Yumiko Overlay con el botón manual.');
}

downloadBtn?.setAttribute('href', DOWNLOAD_URL);
githubBtn?.setAttribute('href', GITHUB_REPO_URL);

openBtn?.addEventListener('click', () => {
  if (!currentDeepLink) {
    setStatus('Primero generá un código con el botón “Generar nuevo código”.');
    showHelp(true);
    return;
  }

  setStatus('Intentando abrir Yumiko Overlay…');
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
  setStatus(error?.message || 'No pudimos generar el código de conexión.');
});

setupTutorialCard();
