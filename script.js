const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

userInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendBtn.click();
  }
});

// ===============================
// NOTIFICACIONES DEL SISTEMA
// ===============================
function solicitarPermisoNotificaciones() {
    if (!("Notification" in window)) {
        console.log("Este navegador no soporta notificaciones.");
        return;
    }

    if (Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function enviarNotificacion(titulo, cuerpo) {
    if (Notification.permission === "granted") {
        new Notification(titulo, {
            body: cuerpo,
            icon: "varios/yumiko/yumiko-face-full-face.png"
        });

        // Vibración en móviles compatibles
        if (navigator.vibrate) {
            navigator.vibrate([120, 80, 120]);
        }
    }
}


// ===============================
// SISTEMA DE INACTIVIDAD (SEGURO)
// ===============================
let inactivityTimer;
const INACTIVITY_LIMIT = 7000; // 7 segundos

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        sendInactivityMessage();
    }, INACTIVITY_LIMIT);
}

async function sendInactivityMessage() {
    const neutralPrompt = "El usuario estuvo inactivo. Retoma la conversación de forma amable y neutral.";

    try {
        const res = await fetch("/api/yumiko", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: neutralPrompt,
                profile: profile
            })
        });

        const data = await res.json();
        const reply = data.reply || "¿Seguimos hablando?";

        addMessage(reply, "bot");
        saveMessage("assistant", reply);

        // Notificación + vibración
        enviarNotificacion("Nuevo mensaje", reply);

    } catch (error) {
        console.error("Error en mensaje automático:", error);
    }

    resetInactivityTimer();
}


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
    goal: null
};

function saveProfile() {
    localStorage.setItem("profile", JSON.stringify(profile));
}

// Detectar nombre y meta
function detectProfileData(userMessage) {

    // Nombre
    if (userMessage.toLowerCase().includes("mi nombre es")) {
        const name = userMessage.split("mi nombre es")[1].trim();
        profile.name = name;
        saveProfile();
    }

    // Meta (se guarda pero ya no activa retos)
    if (userMessage.toLowerCase().includes("mi meta es")) {
        const goal = userMessage.split("mi meta es")[1].trim();
        profile.goal = goal;
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

    resetInactivityTimer();

  } catch (error) {
    addMessage("Hubo un error al conectar con Yumiko.", "bot");
  }

  typingIndicator.classList.add("hidden");

  document.querySelector(".glow-yumiko").style.opacity = 0;
  document.querySelector(".aura-yumiko").style.opacity = 0;
  document.querySelector(".aura-yumiko").style.transform = "scale(1)";
});

// Resetear timer cuando el usuario escribe
userInput.addEventListener("input", resetInactivityTimer);

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
// BOTÓN: REINICIAR CHAT
// ===============================

const resetBtn = document.getElementById("reset-chat");

if (resetBtn) {
    resetBtn.addEventListener("click", () => {
        localStorage.removeItem("chatHistory");
        localStorage.removeItem("profile");
        location.reload();
    });
}

// ===============================
// BOTÓN: REGENERAR RESPUESTA
// ===============================

const regenBtn = document.getElementById("regenerate-btn");
let regenCooldown = false;

if (regenBtn) {
    regenBtn.addEventListener("click", async () => {

        if (regenCooldown) return;

        regenCooldown = true;
        regenBtn.classList.add("loading");
        regenBtn.textContent = "Regenerando";

        const history = JSON.parse(localStorage.getItem("chatHistory")) || [];

        const lastUserMessage = [...history].reverse().find(msg => msg.role === "user");

        if (!lastUserMessage) {
            addMessage("No hay mensaje para regenerar.", "bot");
            regenBtn.classList.remove("loading");
            regenBtn.textContent = "Regenerar";
            regenCooldown = false;
            return;
        }

        typingIndicator.classList.remove("hidden");

        try {
            const res = await fetch("/api/yumiko", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: lastUserMessage.content,
                    profile: profile
                })
            });

            const data = await res.json();
            const newReply = data.reply || "No pude regenerar la respuesta.";

            const botMessages = document.querySelectorAll(".message.bot .bubble");
            if (botMessages.length > 0) {
                botMessages[botMessages.length - 1].textContent = newReply;
            }

            history.push({ role: "assistant", content: newReply });
            localStorage.setItem("chatHistory", JSON.stringify(history));

            yumikoSound.currentTime = 0;
            yumikoSound.play();

            resetInactivityTimer();

        } catch (error) {
            addMessage("Hubo un error al regenerar la respuesta.", "bot");
        }

        typingIndicator.classList.add("hidden");

        setTimeout(() => {
            regenBtn.classList.remove("loading");
            regenBtn.textContent = "Regenerar";
            regenCooldown = false;
        }, 7000);
    });
}

// ===============================
// INICIALIZACIÓN
// ===============================

window.onload = () => {
    loadHistory();
    resetInactivityTimer();
    solicitarPermisoNotificaciones();
};

