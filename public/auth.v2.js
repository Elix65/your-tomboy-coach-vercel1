// ===============================
// SUPABASE CLIENT
// ===============================
import supabaseClient from './supabase.js';

const safeLocalStorage = (() => {
  try {
    const testKey = "__yumiko_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (error) {
    return null;
  }
})();


// Detectar página actual
const currentPage = window.location.pathname;

function getPostLoginRedirectPath() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "";
  if (returnTo.startsWith("/")) {
    return returnTo;
  }
  return "/index.html";
}

const postLoginRedirectPath = getPostLoginRedirectPath();

function goWithTransition(url) {
  if (typeof window.playPageTransitionAndGo === "function") {
    window.playPageTransitionAndGo(url);
    return;
  }
  window.location.href = url;
}

// ===============================
// LOGIN.HTML → si hay sesión, redirigir al dojo
// ===============================
if (currentPage.includes("login")) {
  supabaseClient.auth.getUser().then((res) => {
    const user = res?.data?.user;
    if (user) {
      goWithTransition(postLoginRedirectPath);
    }
  });
}

// ===============================
// INDEX.HTML / GACHA.HTML → si NO hay sesión, redirigir al login
// ===============================
if (currentPage.includes("index") || currentPage.includes("gacha")) {
  supabaseClient.auth.getUser().then((res) => {
    const user = res?.data?.user;
    if (!user) {
      window.location.href = "login.html";
    }
  });
}

// ===============================
// LOGIN
// ===============================
const loginBtn = document.getElementById("btn-login");
const registerBtn = document.getElementById("btn-register");
const passwordInput = document.getElementById("password");
const emailInput = document.getElementById("email");
const errorBox = document.getElementById("login-error");
const forgotPasswordLink = document.getElementById("forgot-password-link");
const sendResetBtn = document.getElementById("btn-send-reset");
const resetBackBtn = document.getElementById("btn-reset-back");
const loginTitle = document.getElementById("login-title");
const recoveryCopy = document.getElementById("recovery-copy");
const loginContainer = document.getElementById("login-container");

let isRecoveryMode = false;
let isRegisterMode = false;

function showAuthMessage(message, type = "error") {
  if (!errorBox) {
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove("hidden", "success");

  if (type === "success") {
    errorBox.classList.add("success");
  }
}

function clearAuthMessage() {
  if (!errorBox) {
    return;
  }

  errorBox.textContent = "";
  errorBox.classList.add("hidden");
  errorBox.classList.remove("success");
}

function setRecoveryMode(enabled) {
  isRecoveryMode = enabled;
  clearAuthMessage();

  if (passwordInput) {
    passwordInput.classList.toggle("hidden", enabled);
  }
  if (loginBtn) {
    loginBtn.classList.toggle("hidden", enabled);
  }
  if (registerBtn) {
    registerBtn.classList.toggle("hidden", enabled);
  }
  if (forgotPasswordLink) {
    forgotPasswordLink.classList.toggle("hidden", enabled);
  }
  if (sendResetBtn) {
    sendResetBtn.classList.toggle("hidden", !enabled);
  }
  if (resetBackBtn) {
    resetBackBtn.classList.toggle("hidden", !enabled);
  }
  if (loginTitle) {
    loginTitle.textContent = enabled ? "Recuperar contraseña" : "Yumiko te estaba esperando";
  }
  if (recoveryCopy) {
    recoveryCopy.classList.toggle("hidden", !enabled);
  }
}

function setRegisterMode(enabled) {
  isRegisterMode = enabled;
  clearAuthMessage();

  if (loginBtn) {
    loginBtn.textContent = enabled ? "Crear cuenta" : "Entrar al Dojo";
  }

  if (registerBtn) {
    registerBtn.textContent = enabled ? "Ya tengo cuenta" : "Crear cuenta";
  }

  if (loginContainer) {
    loginContainer.classList.toggle("is-register", enabled);
  }
}

setRegisterMode(false);

if (loginBtn) {
  loginBtn.onclick = async () => {
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    try {
      const { error } = isRegisterMode
        ? await supabaseClient.auth.signUp({
          email,
          password
        })
        : await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        console.error(isRegisterMode ? "Register error:" : "Login error:", error.message);
        showAuthMessage(error.message);
        return;
      }

      if (isRegisterMode) {
        showAuthMessage("Registro exitoso. Revisa tu correo para confirmar.", "success");

        if (safeLocalStorage) {
          safeLocalStorage.setItem("yumiko_just_registered_at", String(Date.now()));
        }

        setRegisterMode(false);
        return;
      }

      sessionStorage.setItem("show_entry_choice", "1");
      goWithTransition(postLoginRedirectPath);
    } catch (error) {
      console.error(isRegisterMode ? "Register error:" : "Login error:", error?.message || error);
      showAuthMessage(error?.message || "Uhm… algo falló. ¿Revisamos e intentamos de nuevo? 🥺");
    }
  };
}

if (registerBtn) {
  registerBtn.onclick = () => {
    if (isRecoveryMode) {
      setRecoveryMode(false);
    }

    setRegisterMode(!isRegisterMode);
  };
}

if (forgotPasswordLink) {
  forgotPasswordLink.onclick = () => {
    setRecoveryMode(true);
    emailInput?.focus();
  };
}

if (resetBackBtn) {
  resetBackBtn.onclick = () => {
    setRecoveryMode(false);
    passwordInput?.focus();
    setRegisterMode(isRegisterMode);
  };
}

if (sendResetBtn) {
  sendResetBtn.onclick = async () => {
    if (!isRecoveryMode) {
      setRecoveryMode(true);
    }

    const email = emailInput?.value.trim() || "";
    const originalLabel = "Enviar enlace";

    if (!email) {
      showAuthMessage("Uhm… algo falló. ¿Revisamos el email e intentamos de nuevo? 🥺");
      return;
    }

    sendResetBtn.disabled = true;
    sendResetBtn.textContent = "Enviando...";

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password.html`
      });

      if (error) {
        console.error("Reset password email error:", error.message);
        showAuthMessage("Uhm… algo falló. ¿Revisamos el email e intentamos de nuevo? 🥺");
        return;
      }

      showAuthMessage("Listo. Revisa tu email para continuar… yo me quedo aquí 🫶", "success");
    } catch (error) {
      console.error("Reset password email error:", error?.message || error);
      showAuthMessage("Uhm… algo falló. ¿Revisamos el email e intentamos de nuevo? 🥺");
    } finally {
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = originalLabel;
    }
  };
}

// ===============================
// LOGOUT (para index y gacha)
// ===============================
const logoutButtons = [
  document.getElementById("btn-logout"),
  document.getElementById("m-logout")
].filter(Boolean);

logoutButtons.forEach((logoutBtn) => {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    goWithTransition("login.html");
  };
});
