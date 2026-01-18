
// ===============================
// NAVEGACIÓN TOP BAR
// ===============================
const btnGacha = document.getElementById("btn-gacha");
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");

if (btnGacha) {
  btnGacha.onclick = () => window.location.href = "gacha.html";
}

if (btnInventario) {
  btnInventario.onclick = () => openInventoryPanel();
}

if (btnLogout) {
  btnLogout.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// MENÚ HAMBURGUESA (MOBILE)
// ===============================
const hamburgerBtn = document.getElementById("hamburger-btn");
const mobileMenu = document.getElementById("mobile-menu-overlay");

if (hamburgerBtn) {
  hamburgerBtn.onclick = () => {
    mobileMenu.classList.toggle("hidden");
    mobileMenu.classList.toggle("active");
    hamburgerBtn.classList.toggle("open");
  };
}

if (mobileMenu) {
  mobileMenu.onclick = (e) => {
    if (e.target === mobileMenu) {
      mobileMenu.classList.add("hidden");
      mobileMenu.classList.remove("active");
      hamburgerBtn.classList.remove("open");
    }
  };
}

// Botones internos del menú mobile
const mInv = document.getElementById("m-inventario");
const mGacha = document.getElementById("m-gacha");
const mLogout = document.getElementById("m-logout");

if (mInv) {
  mInv.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    openInventoryPanel();
  };
}

if (mGacha) {
  mGacha.onclick = () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    window.location.href = "gacha.html";
  };
}

if (mLogout) {
  mLogout.onclick = async () => {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
    hamburgerBtn.classList.remove("open");
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

// ===============================
// CHAT YUMIKO
// ===============================
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });
}

function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);

  if (sender === "bot") {
    const avatar = document.createElement("img");
    avatar.src = "varios/yumiko/yumiko-face-full-face.png";
    avatar.classList.add("avatar-small");
    msg.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  msg.appendChild(bubble);
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===============================
// ENVÍO DE MENSAJES
// ===============================
if (sendBtn) {
  sendBtn.onclick = async () => {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    saveMessage("user", text);
    detectProfileData(text);

    userInput.value = "";

    const typing = document.getElementById("typing");
    typing.classList.remove("hidden");

    try {
      const res = await fetch("/api/yumiko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, profile })
      });

      const data = await res.json();
      const reply = data.reply || "No pude procesar tu mensaje.";

      addMessage(reply, "bot");
      saveMessage("assistant", reply);

      yumikoSound.currentTime = 0;
      yumikoSound.play();

      resetInactivityTimers();

    } catch (e) {
      addMessage("Hubo un error al conectar con Yumiko.", "bot");
    }

    typing.classList.add("hidden");
  };
}

// ===============================
// MEMORIA DEL DOJO
// ===============================
function saveMessage(role, content) {
  const history = JSON.parse(localStorage.getItem("chatHistory")) || [];
  history.push({ role, content });
  localStorage.setItem("chatHistory", JSON.stringify(history));
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem("chatHistory")) || [];
  history.forEach(msg => {
    addMessage(msg.content, msg.role === "assistant" ? "bot" : "user");
  });
}

let profile = JSON.parse(localStorage.getItem("profile")) || { name: null, goal: null };

function detectProfileData(text) {
  if (text.toLowerCase().includes("mi nombre es")) {
    profile.name = text.split("mi nombre es")[1].trim();
    localStorage.setItem("profile", JSON.stringify(profile));
  }

  if (text.toLowerCase().includes("mi meta es")) {
    profile.goal = text.split("mi meta es")[1].trim();
    localStorage.setItem("profile", JSON.stringify(profile));
  }
}

// ===============================
// INVENTARIO
// ===============================
async function openInventoryPanel() {
  let overlay = document.getElementById("inventory-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "inventory-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "10000";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "flex-end";

    const drawer = document.createElement("div");
    drawer.style.width = "360px";
    drawer.style.maxWidth = "90%";
    drawer.style.background = "rgba(0,0,0,0.85)";
    drawer.style.padding = "18px";
    drawer.style.overflowY = "auto";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.onclick = () => overlay.remove();

    drawer.appendChild(closeBtn);

    const content = document.createElement("div");
    content.id = "inventory-content";
    drawer.appendChild(content);

    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  const content = document.getElementById("inventory-content");
  content.innerHTML = "Cargando...";

  const user = await supabaseClient.auth.getUser();
  const userId = user.data.user.id;

  const res = await fetch("/api/inventario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });

  const data = await res.json();
  content.innerHTML = data.items
    .map(i => `<p>${i.nombre} (${i.rareza}) x${i.cantidad}</p>`)
    .join("");
}

// ===============================
// INACTIVIDAD
// ===============================
let inactivityTimer;
let secondInactivityTimer;
let firstMessageSent = false;

function resetInactivityTimers() {
  clearTimeout(inactivityTimer);
  clearTimeout(secondInactivityTimer);

  inactivityTimer = setTimeout(sendFirstInactivityMessage, 60000);
  firstMessageSent = false;
}

async function sendFirstInactivityMessage() {
  if (firstMessageSent) return;
  firstMessageSent = true;

  const res = await fetch("/api/yumiko", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "El usuario estuvo inactivo por 1 minuto. Retoma la conversación.",
      profile
    })
  });

  const data = await res.json();
  addMessage(data.reply, "bot");
  saveMessage("assistant", data.reply);

  secondInactivityTimer = setTimeout(sendSecondInactivityMessage, 5 * 60 * 1000);
}

async function sendSecondInactivityMessage() {
  const res = await fetch("/api/yumiko", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "El usuario estuvo inactivo por 5 minutos. Envía un mensaje suave.",
      profile
    })
  });

  const data = await res.json();
  addMessage(data.reply, "bot");
  saveMessage("assistant", data.reply);
}

// ===============================
// AUDIO
// ===============================
const ambienceIntro = document.getElementById("ambience-intro");
const ambienceLoop = document.getElementById("ambience-loop");
const yumikoSound = document.getElementById("yumiko-sound");

if (ambienceIntro) {
  ambienceIntro.volume = 0;
  ambienceIntro.play().then(() => fadeIn(ambienceIntro, 0.12));
  ambienceIntro.onended = () => {
    ambienceLoop.volume = 0;
    ambienceLoop.play();
    fadeIn(ambienceLoop, 0.18);
  };
}

function fadeIn(audio, target) {
  let v = 0;
  const interval = setInterval(() => {
    v += 0.02;
    audio.volume = Math.min(v, target);
    if (v >= target) clearInterval(interval);
  }, 80);
}

// ===============================
// PARALLAX
// ===============================
if (window.innerWidth > 768) {
  document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;

    document.querySelector(".layer-wood").style.transform = `translate(${x}px, ${y}px)`;
    document.querySelector(".layer-shoji").style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
    document.querySelector(".layer-pattern").style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
  });
}

// ===============================
// MOSTRAR UI SI HAY SESIÓN
// ===============================
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;

  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu-overlay");

  if (topBar) topBar.classList.remove("hidden");

  if (hamburgerBtn) {
    if (window.innerWidth <= 768) {
      hamburgerBtn.classList.remove("hidden");
    } else {
      hamburgerBtn.classList.add("hidden");
    }
  }

  if (mobileMenu) {
    mobileMenu.classList.add("hidden");
    mobileMenu.classList.remove("active");
  }
});

// ===============================
// FIN
// ===============================
