import supabaseClient from '/supabase.js';

const statusEl = document.getElementById('overlay-status');
const helpEl = document.getElementById('overlay-help');
const openBtn = document.getElementById('btn-open-deeplink');
const retryBtn = document.getElementById('btn-retry');
const loginBtn = document.getElementById('btn-login');
const tutorialEmbed = document.getElementById('tutorial-embed');
const tutorialPlaceholder = document.getElementById('tutorial-placeholder');
const premiumButtons = Array.from(document.querySelectorAll('.premium-action-btn'));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    setStatus('Si no se abrió Yumiko Overlay, probá nuevamente con el botón “Abrir Overlay”.');
  }, 1200);
}

function getLoginUrl() {
  const returnTo = encodeURIComponent('/overlay/connect');
  return `/login.html?returnTo=${returnTo}`;
}

function spawnParticles(button, x, y) {
  const particlesLayer = button.querySelector('.btn-particles');
  if (!particlesLayer) return;

  particlesLayer.innerHTML = '';
  const particleCount = button.classList.contains('premium-action-btn--primary') ? 8 : 5;

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'btn-particle';
    const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.35;
    const distance = 18 + Math.random() * (button.classList.contains('premium-action-btn--primary') ? 24 : 14);
    const dx = `${Math.cos(angle) * distance}px`;
    const dy = `${Math.sin(angle) * distance}px`;
    particle.style.setProperty('--x', `${x}px`);
    particle.style.setProperty('--y', `${y}px`);
    particle.style.setProperty('--dx', dx);
    particle.style.setProperty('--dy', dy);
    particlesLayer.appendChild(particle);
  }

  window.setTimeout(() => {
    particlesLayer.innerHTML = '';
  }, 620);
}

function attachPremiumButtonFX(button) {
  const clearBurst = () => {
    button.classList.remove('is-pressing');
    button.classList.remove('is-burst');
  };

  button.addEventListener('pointerdown', (event) => {
    button.classList.add('is-pressing');
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    button.style.setProperty('--ripple-x', `${x}px`);
    button.style.setProperty('--ripple-y', `${y}px`);
  });

  button.addEventListener('pointerup', (event) => {
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    button.style.setProperty('--ripple-x', `${x}px`);
    button.style.setProperty('--ripple-y', `${y}px`);
    button.classList.remove('is-pressing');

    if (!prefersReducedMotion.matches) {
      button.classList.remove('is-burst');
      void button.offsetWidth;
      button.classList.add('is-burst');
      spawnParticles(button, x, y);
      window.setTimeout(() => {
        button.classList.remove('is-burst');
      }, 580);
    }
  });

  button.addEventListener('pointerleave', () => {
    button.classList.remove('is-pressing');
  });

  button.addEventListener('pointercancel', clearBurst);
  button.addEventListener('blur', clearBurst);
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

premiumButtons.forEach(attachPremiumButtonFX);
