// ===============================
// SUPABASE CLIENT
// ===============================
const supabaseClient = window.supabase.createClient(
  'https://rlunygzxvpldfaanhxnj.supabase.co',
  'sb_publishable_LcfKHbQf88gNcxQkdEvEaA_Ll_twyUd'
);

// Detectar página actual
const currentPage = window.location.pathname;

// ===============================
// LOGIN.HTML → si hay sesión, redirigir al dojo
// ===============================
if (currentPage.includes("login")) {
  supabaseClient.auth.getUser().then((res) => {
    const user = res?.data?.user;
    if (user) {
      window.location.href = "index.html";
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

    window.location.href = "index.html";
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
  };
}

// ===============================
// LOGOUT (para index y gacha)
// ===============================
const logoutBtn = document.getElementById("btn-logout");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}
