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
  setFormEnabled(true);
  messageBox?.classList.add('hidden');
}

function showExpiredState() {
  expiredShown = true;
  canResetPassword = false;
  setFormEnabled(false);
  showMessage(EXPIRED_MESSAGE);
  showBackToLogin();
}

async function initRecoveryFlow() {
  setFormEnabled(false);

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error('Reset password session error:', error.message);
    }

    if (data?.session) {
      markFlowReady();
    }
  } catch (error) {
    console.error('Reset password session error:', error?.message || error);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || session) {
      markFlowReady();
      return;
    }

    if (!session && !canResetPassword && !expiredShown) {
      showExpiredState();
    }
  });

  window.setTimeout(() => {
    if (!canResetPassword && !expiredShown) {
      showExpiredState();
    }
  }, 1200);
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
      showMessage(EXPIRED_MESSAGE);
      showBackToLogin();
      return;
    }

    showMessage(SUCCESS_MESSAGE, 'success');
    showBackToLogin();
    setFormEnabled(false);
  } catch (error) {
    console.error('Reset password update error:', error?.message || error);
    showMessage(EXPIRED_MESSAGE);
    showBackToLogin();
  } finally {
    saveBtn.textContent = originalLabel;
  }
});

initRecoveryFlow();
