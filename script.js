const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

userInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendBtn.click();
  }
});

// =========================
// MEMORIA DEL DOJO
// =========================

// Historial del chat
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
    return history;
}

// Perfil del usuario
let profile = JSON.parse(localStorage.getItem("profile")) || {
    name: null,
    goal: null,
    challengeStart: null
};

function saveProfile() {
    localStorage.setItem("profile", JSON.stringify(profile));
}

// Día del reto
function getChallengeDay() {
    if (!profile.challengeStart) return null;

    const start = new Date(profile.challengeStart);
    const now = new Date();

    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
    return diff;
}

// Pregunta tsundere de Yumiko
function yumikoChallengePrompt() {
    const day = getChallengeDay();
    const username = profile.name || "usuario-kun";

    if (!day) return null;

    return `Hey ${username}, mi memoria es mala... ¿por qué día del reto vamos? ¡No vayas a mentirme, idiota!`;
}

// Mensaje inicial solo la primera vez
function startIfNew() {
    const history = JSON.parse(localStorage.getItem("chatHistory")) || [];

    if (history.length === 0) {
        const firstMessage = "Bienvenido al dojo. Estoy lista para entrenar contigo.";
        addMessage(firstMessage, "bot");
        saveMessage("assistant", firstMessage);
    }
}

// Detectar nombre y meta
function detectProfileData(userMessage) {

    // Nombre
    if (userMessage.toLowerCase().includes("mi nombre es")) {
        const name = userMessage.split("mi nombre es")[1].trim();
        profile.name = name;
        saveProfile();
    }

    // Meta
    if (userMessage.toLowerCase().includes("mi meta es")) {
        const goal = userMessage.split("mi meta es")[1].trim();
        profile.goal = goal;
        profile.challengeStart = new Date().toISOString();
        saveProfile();
    }
}

// ===============================
// AUDIO Y EFECTOS
// ===============================

const typingIndicator = document.getElementById("typing");



const ambienceIntro = document.getElementById("ambience-intro");
ambienceIntro.volume = 0;
ambienceIntro.loop = false;

const ambienceLoop = document.getElementById("ambience-loop");
ambienceLoop.volume = 0;
ambienceLoop.loop = true;

ambienceIntro.play().then(() => {
  fadeIn(ambienceIntro, 0.12);
}).catch(() => {
  document.addEventListener("click", () => {
    ambienceIntro.play();
    fadeIn(ambienceIntro, 0.12);
  }, { once: true });
});

ambienceIntro.addEventListener("ended", () => {
  ambienceLoop.currentTime = 0;
  ambienceLoop.play();
  fadeIn(ambienceLoop, 0.18);
});

function fadeIn(audio, targetVolume) {
  let vol = 0;
  const fade = setInterval(() => {
    vol += 0.02;
    audio.volume = Math.min(vol, targetVolume);
    if (vol >= targetVolume) clearInterval(fade);
  }, 80);
}

const yumikoSound = new Audio("/varios/musica/doing.mp3");
yumikoSound.volume = 0.85;

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  if (sender === "bot") {
    const avatar = document.createElement("img");
    avatar.classList.add("avatar-small");
    avatar.src = "varios/yumiko/yumiko-face-full-face.png";
    message.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  message.appendChild(bubble);
  chatBox.appendChild(message);

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===============================
// ENVÍO DE MENSAJES
// ===============================

sendBtn.addEventListener("click", async () => {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  saveMessage("user", text);
  detectProfileData(text);

  userInput.value = "";

  typingIndicator.classList.remove("hidden");

  document.querySelector(".glow-yumiko").style.opacity = 1;
  document.querySelector(".aura-yumiko").style.opacity = 1;
  document.querySelector(".aura-yumiko").style.transform = "scale(1.15)";

  try {
    const res = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      message: text,
      profile: profile
    })
  });


    const data = await res.json();
    const reply = data.reply || "No pude procesar tu mensaje.";

    addMessage(reply, "bot");
    saveMessage("assistant", reply);

    yumikoSound.currentTime = 0;
    yumikoSound.play();

  } catch (error) {
    addMessage("Hubo un error al conectar con Yumiko.", "bot");
  }

  typingIndicator.classList.add("hidden");

  document.querySelector(".glow-yumiko").style.opacity = 0;
  document.querySelector(".aura-yumiko").style.opacity = 0;
  document.querySelector(".aura-yumiko").style.transform = "scale(1)";
});


// ===============================
// PARALLAX (DESACTIVADO EN MÓVIL)
// ===============================

if (window.innerWidth > 768) {
  document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;

    const wood = document.querySelector(".layer-wood");
    const shoji = document.querySelector(".layer-shoji");
    const pattern = document.querySelector(".layer-pattern");

    if (wood) wood.style.transform = `translate(${x}px, ${y}px)`;
    if (shoji) shoji.style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
    if (pattern) pattern.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
  });
}

// ===============================
// INICIALIZACIÓN
// ===============================

window.onload = () => {
    loadHistory();
    startIfNew();

    const prompt = yumikoChallengePrompt();
    if (prompt) {
        addMessage(prompt, "bot");
        saveMessage("assistant", prompt);
    }
};
