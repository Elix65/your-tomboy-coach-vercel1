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
      goWithTransition("index.html");
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
if (loginBtn) {
  loginBtn.onclick = async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorBox = document.getElementById("login-error");

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("hidden");
      }
      return;
    }

    sessionStorage.setItem("show_entry_choice", "1");
    goWithTransition("index.html");
  };
}

// ===============================
// REGISTRO
// ===============================
const registerBtn = document.getElementById("btn-register");
if (registerBtn) {
  registerBtn.onclick = async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorBox = document.getElementById("login-error");

    const { error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) {
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("hidden");
      }
      return;
    }

    if (errorBox) {
      errorBox.textContent = "Registro exitoso. Revisa tu correo para confirmar.";
      errorBox.classList.remove("hidden");
    }

    if (safeLocalStorage) {
      safeLocalStorage.setItem("yumiko_just_registered_at", String(Date.now()));
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
