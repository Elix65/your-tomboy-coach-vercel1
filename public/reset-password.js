import supabaseClient from './supabase.js';

const saveBtn = document.getElementById('btn-save-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const messageBox = document.getElementById('reset-message');
const backToLogin = document.getElementById('back-to-login');

const EXPIRED_MESSAGE = 'Este enlace expiró o ya fue usado. Pide uno nuevo desde el login, ¿sí? 🥺';
const SUCCESS_MESSAGE = 'Hecho. Ya puedes iniciar sesión otra vez 🫶';

let canResetPassword = false;
let expiredShown = false;

function showMessage(message, type = 'error') {
  if (!messageBox) {
    return;
  }

  messageBox.textContent = message;
  messageBox.classList.remove('hidden', 'success');

  if (type === 'success') {
    messageBox.classList.add('success');
  }
}

function showBackToLogin() {
  backToLogin?.classList.remove('hidden');
}

function setFormVisible(visible) {
  newPasswordInput?.classList.toggle('hidden', !visible);
  confirmPasswordInput?.classList.toggle('hidden', !visible);
  saveBtn?.classList.toggle('hidden', !visible);
}

function setFormEnabled(enabled) {
  if (newPasswordInput) {
    newPasswordInput.disabled = !enabled;
  }
  if (confirmPasswordInput) {
    confirmPasswordInput.disabled = !enabled;
  }
  if (saveBtn) {
    saveBtn.disabled = !enabled;
  }
}

function markFlowReady() {
  canResetPassword = true;
  expiredShown = false;
  setFormVisible(true);
  setFormEnabled(true);
  messageBox?.classList.add('hidden');
}

function showExpiredState() {
  expiredShown = true;
  canResetPassword = false;
  setFormVisible(false);
  setFormEnabled(false);
  showMessage(EXPIRED_MESSAGE);
  showBackToLogin();
}

function isOtpExpiredError(error) {
  if (!error) {
    return false;
  }

  const raw = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return raw.includes('otp_expired');
}

async function initRecoveryFlow() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const errorCode = params.get('error_code');
  const errorDescription = params.get('error_description');

  console.log('[reset] params', { code: !!code, error_code: errorCode, href: location.href });

  setFormVisible(false);
  setFormEnabled(false);

  if (errorCode) {
    showMessage(errorDescription || EXPIRED_MESSAGE);
    showBackToLogin();
    return;
  }

  if (code) {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Reset password exchange code error:', error.message);
      showExpiredState();
      return;
    }
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    console.log('[reset] session?', !!data?.session);

    if (error) {
      console.error('Reset password session error:', error.message);
    }

    if (data?.session) {
      markFlowReady();
    }
  } catch (error) {
    console.error('Reset password session error:', error?.message || error);
  }

  showExpiredState();
}

saveBtn?.addEventListener('click', async () => {
  const newPassword = newPasswordInput?.value || '';
  const confirmPassword = confirmPasswordInput?.value || '';

  if (!canResetPassword) {
    showExpiredState();
    return;
  }

  if (newPassword.length < 8) {
    showMessage('Mínimo 8 caracteres.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage('Las contraseñas no coinciden.');
    return;
  }

  const originalLabel = 'Guardar contraseña';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

    if (error) {
      console.error('Reset password update error:', error.message);
      showMessage(isOtpExpiredError(error) ? EXPIRED_MESSAGE : error.message);
      showBackToLogin();
      return;
    }

    showMessage(SUCCESS_MESSAGE, 'success');
    showBackToLogin();
    expiredShown = false;
    canResetPassword = false;
    setFormVisible(false);
    setFormEnabled(false);
  } catch (error) {
    console.error('Reset password update error:', error?.message || error);
    showMessage(isOtpExpiredError(error) ? EXPIRED_MESSAGE : (error?.message || 'No se pudo actualizar la contraseña.'));
    showBackToLogin();
  } finally {
    saveBtn.textContent = originalLabel;
  }
});

initRecoveryFlow();
