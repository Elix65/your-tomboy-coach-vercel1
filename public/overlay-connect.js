import supabaseClient from './supabase.js';

const statusEl = document.getElementById('overlay-status');
const openBtn = document.getElementById('btn-open-deeplink');
const retryBtn = document.getElementById('btn-retry');

let currentDeepLink = null;

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function openDeepLink() {
  if (!currentDeepLink) {
    setStatus('Todavía no tenemos deep link listo.');
    return;
  }
  window.location.href = currentDeepLink;
}

async function startPairing() {
  setStatus('Generando código de conexión…');

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

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
    throw new Error(payload?.error || 'No pudimos iniciar la conexión de overlay.');
  }

  currentDeepLink = payload.deepLink;
  setStatus('Intentando abrir Yumiko Overlay… si no se abre, usa el botón manual.');
  openDeepLink();
}

openBtn?.addEventListener('click', openDeepLink);
retryBtn?.addEventListener('click', async () => {
  try {
    await startPairing();
  } catch (error) {
    setStatus(error?.message || 'Error al generar nuevo código.');
  }
});

startPairing().catch((error) => {
  setStatus(error?.message || 'No pudimos abrir el deep link automáticamente.');
});
