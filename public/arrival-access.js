import supabaseClient from './supabase.js';

const currentPage = window.location.pathname;
const url = new URL(window.location.href);
const errorBox = document.getElementById('login-error');

function showMessage(message, type = 'error') {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove('hidden', 'success');
  if (type === 'success') {
    errorBox.classList.add('success');
  } else {
    errorBox.classList.remove('success');
  }
}

function clearMessage() {
  if (!errorBox) return;
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
  errorBox.classList.remove('success');
}

async function parseJsonResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function postJson(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || 'request_failed');
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function goTo(href) {
  if (typeof window.playPageTransitionAndGo === 'function') {
    window.playPageTransitionAndGo(href);
    return;
  }
  window.location.href = href;
}

function setReturnState(state, payload = {}) {
  const container = document.getElementById('login-container');
  const eyebrow = document.getElementById('arrival-return-eyebrow');
  const title = document.getElementById('arrival-return-title');
  const subtitle = document.getElementById('arrival-return-subtitle');
  const statusPill = document.getElementById('arrival-return-status-text');
  const primaryCta = document.getElementById('arrival-return-primary');
  const secondaryCta = document.getElementById('arrival-return-secondary');

  if (!container || !eyebrow || !title || !subtitle || !statusPill || !primaryCta || !secondaryCta) {
    return;
  }

  container.dataset.returnState = state;
  clearMessage();
  primaryCta.classList.remove('hidden');
  secondaryCta.classList.remove('hidden');

  if (state === 'activation_ready') {
    eyebrow.textContent = 'TU ACCESO YA FUE ABIERTO';
    title.textContent = 'Elegí tu contraseña para entrar.';
    subtitle.textContent = 'Tu llegada ya fue confirmada. Este es el último paso para abrir tu espacio con Yumiko.';
    statusPill.textContent = 'Acceso confirmado';
    primaryCta.textContent = 'Elegir mi contraseña';
    primaryCta.href = payload.activation_url || '/arrival/activate';
    secondaryCta.textContent = 'Volver al inicio';
    secondaryCta.href = '/login.html';
    return;
  }

  if (state === 'pending') {
    eyebrow.textContent = 'CONFIRMANDO TU LLEGADA';
    title.textContent = 'Tu acceso está siendo confirmado.';
    subtitle.textContent = 'Estamos esperando la confirmación final de la pasarela.';
    statusPill.textContent = 'Pago pendiente';
    primaryCta.textContent = 'Actualizar estado';
    primaryCta.href = window.location.pathname + window.location.search;
    secondaryCta.textContent = 'Volver al inicio';
    secondaryCta.href = '/login.html';
    return;
  }

  eyebrow.textContent = 'TU LLEGADA SIGUE EN PAUSA';
  title.textContent = 'Todavía no pudimos abrir este acceso.';
  subtitle.textContent = 'Si la pasarela canceló o rechazó el pago, podés volver a empezar cuando quieras.';
  statusPill.textContent = 'Pago no confirmado';
  primaryCta.textContent = 'Volver al inicio';
  primaryCta.href = '/login.html';
  secondaryCta.textContent = 'Intentar de nuevo';
  secondaryCta.href = '/login.html';
}

async function setupArrivalReturnPage() {
  if (!currentPage.includes('/arrival-return') && !currentPage.includes('/arrival/return')) {
    return;
  }

  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const requestUrl = new URL('/api/arrival/return', window.location.origin);
  url.searchParams.forEach((value, key) => {
    requestUrl.searchParams.set(key, value);
  });

  if (!email) {
    setReturnState('payment_unavailable');
    showMessage('Necesitamos reconocer tu email para retomar esta llegada.');
    return;
  }

  try {
    const response = await fetch(requestUrl.pathname + requestUrl.search);
    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw Object.assign(new Error(data?.error || 'arrival_return_failed'), { payload: data, status: response.status });
    }

    setReturnState(data?.state || 'pending', data);
  } catch (error) {
    console.error('Arrival return error:', error?.payload || error?.message || error);
    setReturnState('payment_unavailable');
    showMessage('No pude revisar el estado real de tu pago ahora. Intentá otra vez en un momento.');
  }
}

function setActivationState(state) {
  const statusPill = document.getElementById('activation-status-text');
  const eyebrow = document.getElementById('activation-eyebrow');
  const title = document.getElementById('activation-title');
  const subtitle = document.getElementById('activation-subtitle');
  const form = document.getElementById('activation-form');
  const helper = document.getElementById('activation-helper');
  const primaryLink = document.getElementById('activation-fallback-primary');
  const secondaryLink = document.getElementById('activation-fallback-secondary');

  if (!statusPill || !eyebrow || !title || !subtitle || !form || !helper || !primaryLink || !secondaryLink) {
    return;
  }

  clearMessage();

  const ready = state === 'ready';
  form.classList.toggle('hidden', !ready);
  helper.classList.toggle('hidden', !ready);
  primaryLink.classList.toggle('hidden', ready);
  secondaryLink.classList.toggle('hidden', ready);

  if (ready) {
    statusPill.textContent = 'Acceso confirmado';
    eyebrow.textContent = 'TU ACCESO YA FUE ABIERTO';
    title.textContent = 'Elegí tu contraseña para entrar.';
    subtitle.textContent = 'Tu llegada ya fue confirmada. Este es el último paso para abrir tu espacio con Yumiko.';
    return;
  }

  if (state === 'pending') {
    statusPill.textContent = 'Pago pendiente';
    eyebrow.textContent = 'CONFIRMANDO TU LLEGADA';
    title.textContent = 'Tu acceso está siendo confirmado.';
    subtitle.textContent = 'Estamos esperando la confirmación final de la pasarela.';
    primaryLink.textContent = 'Actualizar estado';
    primaryLink.href = '/arrival/return' + window.location.search.replace(/^[^?]*/, '');
    secondaryLink.textContent = 'Volver al inicio';
    secondaryLink.href = '/login.html';
    return;
  }

  if (state === 'used') {
    statusPill.textContent = 'Acceso ya usado';
    eyebrow.textContent = 'TU ACCESO YA QUEDÓ ABIERTO';
    title.textContent = 'Este acceso ya fue utilizado.';
    subtitle.textContent = 'Si ya elegiste tu contraseña, entrá desde la puerta reservada.';
    primaryLink.textContent = 'Ir al login';
    primaryLink.href = '/member-login.html';
    secondaryLink.textContent = 'Volver al inicio';
    secondaryLink.href = '/login.html';
    return;
  }

  statusPill.textContent = 'Acceso no disponible';
  eyebrow.textContent = 'ACCESO NO DISPONIBLE';
  title.textContent = 'Este acceso ya no está disponible.';
  subtitle.textContent = 'Puede que haya expirado o que ya haya sido usado.';
  primaryLink.textContent = 'Volver al inicio';
  primaryLink.href = '/login.html';
  secondaryLink.textContent = 'Ir al login';
  secondaryLink.href = '/member-login.html';
}

async function setupActivationPage() {
  if (!currentPage.includes('/activate-access') && !currentPage.includes('/arrival/activate')) {
    return;
  }

  const token = String(url.searchParams.get('token') || '').trim();
  const form = document.getElementById('activation-form');
  const passwordInput = document.getElementById('activation-password');
  const confirmInput = document.getElementById('activation-password-confirm');
  const submitBtn = document.getElementById('activation-submit');

  if (!token) {
    setActivationState('invalid');
    return;
  }

  try {
    const requestUrl = new URL('/api/arrival/activation', window.location.origin);
    requestUrl.searchParams.set('token', token);
    const response = await fetch(requestUrl.pathname + requestUrl.search);
    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw Object.assign(new Error(data?.error || 'activation_status_failed'), { payload: data, status: response.status });
    }

    setActivationState(data?.state || 'invalid');
  } catch (error) {
    console.error('Activation status error:', error?.payload || error?.message || error);
    setActivationState('invalid');
    showMessage('No pude validar este acceso ahora. Intentá otra vez en un momento.');
    return;
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (password.length < 8) {
      showMessage('Elegí una contraseña de al menos 8 caracteres.');
      passwordInput?.focus();
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Las dos contraseñas tienen que coincidir para abrir tu espacio.');
      confirmInput?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await postJson('/api/arrival/activate', { token, password });
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: result.email,
        password
      });

      if (error) throw error;

      showMessage('Tu acceso quedó activado. Entrando…', 'success');
      window.sessionStorage.setItem('show_entry_choice', '1');
      window.setTimeout(() => {
        goTo(result.redirect_to || '/index.html');
      }, 250);
    } catch (error) {
      console.error('Activation submit error:', error?.payload || error?.message || error);
      if (error?.payload?.error === 'account_already_enabled') {
        setActivationState('used');
      }
      showMessage(error?.payload?.error_description || error?.message || 'No pude completar este acceso. Intentemos de nuevo.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

void setupArrivalReturnPage();
void setupActivationPage();
