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
const returnToParam = new URLSearchParams(window.location.search).get("returnTo");

function getSafeReturnTo() {
  if (!returnToParam || !returnToParam.startsWith("/")) {
    return null;
  }

  if (returnToParam.startsWith("//")) {
    return null;
  }

  return returnToParam;
}

function getPostLoginRedirectPath() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "";
  if (returnTo.startsWith("/")) {
    return returnTo;
  }
  return "/index.html";
}

const postLoginRedirectPath = getPostLoginRedirectPath();

function isInitDebugFlagEnabled(flag) {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flag) === "1") return true;
  const list = String(params.get("debug_init_flags") || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  if (list.includes(flag)) return true;
  return window.localStorage.getItem(flag) === "1" || window.sessionStorage.getItem(flag) === "1";
}


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
      const safeReturnTo = getSafeReturnTo();
      goWithTransition(safeReturnTo || "index.html");
      goWithTransition(postLoginRedirectPath);
    }
  });
}

// ===============================
// INDEX.HTML / GACHA.HTML → si NO hay sesión, redirigir al login
// ===============================
if (currentPage.includes("index") || currentPage.includes("gacha")) {
  if (isInitDebugFlagEnabled("DISABLE_AUTH_REHYDRATION")) {
    console.info("[DEBUG_INIT] auth rehydration disabled by flag");
  } else {
    supabaseClient.auth.getUser().then((res) => {
      const user = res?.data?.user;
      if (!user) {
        window.location.href = "login.html";
      }
    });
  }
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
const onboardingStage = document.getElementById("onboarding-stage");

let isRecoveryMode = false;
let isRegisterMode = false;

const arrivalNameInput = document.getElementById("arrival-name");
const arrivalNextBtn = document.getElementById("btn-arrival-next");
const arrivalContinueBtn = document.getElementById("btn-arrival-continue");
const arrivalNameDisplay = document.getElementById("arrival-name-display");
const arrivalAuthForm = document.getElementById("arrival-auth-form");
const arrivalEmailInput = document.getElementById("arrival-email");
const arrivalPasswordInput = document.getElementById("arrival-password");
const arrivalSaveBtn = document.getElementById("btn-arrival-save");
const arrivalEnterBtn = document.getElementById("btn-arrival-enter");

const loginSteps = document.getElementById("login-steps");
const loginStepsText = document.getElementById("login-steps-text");

const RITUAL_LINES_BY_STEP = {
  "1": "Tu llegada empieza ahora.",
  "2": "Yumiko ya sabe cómo llamarte.",
  "3": "Tu regreso quedará guardado.",
  "4": "El salón ya está listo para vos."
};

const RITUAL_TEXT_TRANSITION_MS = 200;

const STEP_TRANSITION_MS = 260;
let isStepTransitioning = false;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function syncOnboardingStepVisibility(activeStep) {
  if (!loginContainer) {
    return;
  }

  const targetStep = String(activeStep);
  const onboardingSteps = loginContainer.querySelectorAll("[data-onboarding-step]");

  onboardingSteps.forEach((stepNode) => {
    const isActive = stepNode.dataset.onboardingStep === targetStep;
    stepNode.classList.toggle("hidden", !isActive);
    stepNode.setAttribute("aria-hidden", String(!isActive));
    stepNode.dataset.active = isActive ? "true" : "false";
  });
}

async function setOnboardingStep(step) {
  if (!loginContainer) {
    return;
  }

  if (isStepTransitioning) {
    return;
  }

  const targetStep = String(step);
  const currentStep = loginContainer.dataset.step || "1";

  if (currentStep === targetStep) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const currentStepNode = loginContainer.querySelector(`[data-onboarding-step="${currentStep}"]`);
  const nextStepNode = loginContainer.querySelector(`[data-onboarding-step="${targetStep}"]`);

  if (onboardingStage && currentStepNode && nextStepNode) {
    const stageHeight = Math.max(currentStepNode.offsetHeight, nextStepNode.offsetHeight);
    onboardingStage.style.minHeight = `${stageHeight}px`;
  }

  isStepTransitioning = true;
  loginContainer.classList.add("is-transitioning");

  try {
    if (nextStepNode) {
      nextStepNode.classList.remove("step-exit");
      nextStepNode.classList.add("step-enter");
      nextStepNode.classList.remove("hidden");
      nextStepNode.setAttribute("aria-hidden", "true");
      nextStepNode.dataset.active = "false";
    }

    if (!prefersReducedMotion && currentStepNode) {
      currentStepNode.classList.add("step-exit");
      await sleep(STEP_TRANSITION_MS);
      currentStepNode.classList.remove("step-exit");
    }

    loginContainer.dataset.step = targetStep;
    await syncRitualLine(targetStep);

    syncOnboardingStepVisibility(targetStep);

    if (!prefersReducedMotion && nextStepNode) {
      void nextStepNode.offsetWidth;
      nextStepNode.classList.remove("step-enter");
      await sleep(STEP_TRANSITION_MS);
    }
  } finally {
    if (onboardingStage) {
      onboardingStage.style.minHeight = "";
    }

    loginContainer.classList.remove("is-transitioning");
    isStepTransitioning = false;
  }
}

async function syncRitualLine(step) {
  if (!loginSteps || !loginStepsText) {
    return;
  }

  const targetStep = String(step);
  const nextLine = RITUAL_LINES_BY_STEP[targetStep];

  if (!nextLine) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    loginStepsText.textContent = nextLine;
    loginSteps.dataset.step = targetStep;
    return;
  }

  loginStepsText.classList.add("is-changing");
  await sleep(RITUAL_TEXT_TRANSITION_MS);
  loginStepsText.textContent = nextLine;
  loginSteps.dataset.step = targetStep;
  loginStepsText.classList.remove("is-changing");
}

function validateArrivalName(rawName) {
  const name = rawName.trim();

  if (!name) {
    return "Decime tu nombre para que Yumiko pueda recibirte.";
  }

  if (name.length < 2) {
    return "Usá al menos 2 caracteres para tu nombre.";
  }

  if (name.length > 24) {
    return "Tu nombre puede tener hasta 24 caracteres.";
  }

  return null;
}

function submitArrivalStep() {
  const rawName = arrivalNameInput?.value || "";
  const validationError = validateArrivalName(rawName);

  if (validationError) {
    showAuthMessage(validationError);
    arrivalNameInput?.focus();
    return;
  }

  clearAuthMessage();
  const normalizedName = rawName.trim();
  window.sessionStorage.setItem("yumiko_arrival_name", normalizedName);
  void setOnboardingStep(2);
}


function getStoredArrivalName() {
  return (window.sessionStorage.getItem("yumiko_arrival_name") || "").trim();
}

function updateArrivalWelcomeName() {
  const storedName = getStoredArrivalName();

  if (!storedName) {
    // Si no hay nombre, no dejamos al usuario en step 2.
    void setOnboardingStep(1);
    arrivalNameInput?.focus();
    return false;
  }

  if (arrivalNameDisplay) {
    arrivalNameDisplay.textContent = storedName;
  }

  return true;
}

function submitArrivalStepTwo() {
  clearAuthMessage();
  void setOnboardingStep(3);
}

async function runPasswordAuth({ email, password, registerMode = false }) {
  const authResponse = registerMode
    ? await supabaseClient.auth.signUp({ email, password })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  if (authResponse.error) {
    return { error: authResponse.error };
  }

  return { error: null };
}

async function submitArrivalStepThree() {
  const email = arrivalEmailInput?.value.trim() || "";
  const password = arrivalPasswordInput?.value || "";

  if (!email || !password) {
    showAuthMessage("Completá email y contraseña para guardar tu llegada.");
    if (!email) {
      arrivalEmailInput?.focus();
      return;
    }
    arrivalPasswordInput?.focus();
    return;
  }

  clearAuthMessage();

  if (arrivalSaveBtn) {
    arrivalSaveBtn.disabled = true;
  }

  try {
    const { error } = await runPasswordAuth({ email, password });

    if (error) {
      console.error("Arrival auth error:", error.message);
      showAuthMessage(error.message);
      return;
    }

    // Dejamos listo el siguiente paso del onboarding premium.
    await setOnboardingStep(4);
  } catch (error) {
    console.error("Arrival auth error:", error?.message || error);
    showAuthMessage(error?.message || "Uhm… algo falló. ¿Revisamos e intentamos de nuevo? 🥺");
  } finally {
    if (arrivalSaveBtn) {
      arrivalSaveBtn.disabled = false;
    }
  }
}


function submitArrivalStepFour() {
  clearAuthMessage();
  sessionStorage.setItem("show_entry_choice", "1");
  const safeReturnTo = getSafeReturnTo();
  goWithTransition(safeReturnTo || "index.html");
  goWithTransition(postLoginRedirectPath);
}

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
syncOnboardingStepVisibility(loginContainer?.dataset.step || "1");
void syncRitualLine(loginContainer?.dataset.step || "1");

// Pantalla 1 del onboarding premium: captura nombre y avanza de step sin autenticar.
if (arrivalNameInput && arrivalNextBtn) {
  loginContainer.dataset.step = "1";

  arrivalNextBtn.onclick = submitArrivalStep;
  arrivalNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    submitArrivalStep();
  });
}

if (arrivalContinueBtn) {
  arrivalContinueBtn.onclick = submitArrivalStepTwo;

  // Enter también avanza cuando el foco está dentro del step 2.
  const onboardingStepTwo = loginContainer?.querySelector('[data-onboarding-step="2"]');
  onboardingStepTwo?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && !onboardingStepTwo.contains(activeElement)) {
      return;
    }

    event.preventDefault();
    submitArrivalStepTwo();
  });
}

if (loginContainer) {
  const observer = new MutationObserver(() => {
    const currentStep = loginContainer.dataset.step;

    if (currentStep === "2") {
      if (updateArrivalWelcomeName()) {
        arrivalContinueBtn?.focus();
      }
      return;
    }

    if (currentStep === "3") {
      if (!getStoredArrivalName()) {
        void setOnboardingStep(1);
        arrivalNameInput?.focus();
        return;
      }
      arrivalEmailInput?.focus();
      return;
    }

    if (currentStep === "4") {
      arrivalEnterBtn?.focus();
    }
  });

  observer.observe(loginContainer, {
    attributes: true,
    attributeFilter: ["data-step"]
  });
}

if (arrivalAuthForm) {
  arrivalAuthForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitArrivalStepThree();
  });
}

if (arrivalEnterBtn) {
  arrivalEnterBtn.onclick = submitArrivalStepFour;

  const onboardingStepFour = loginContainer?.querySelector('[data-onboarding-step="4"]');
  onboardingStepFour?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && !onboardingStepFour.contains(activeElement)) {
      return;
    }

    event.preventDefault();
    submitArrivalStepFour();
  });
}

if (loginBtn) {
  loginBtn.onclick = async () => {
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    try {
      const { error } = await runPasswordAuth({
        email,
        password,
        registerMode: isRegisterMode
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
      const safeReturnTo = getSafeReturnTo();
      goWithTransition(safeReturnTo || "index.html");
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
