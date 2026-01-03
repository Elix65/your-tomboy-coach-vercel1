const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const typingIndicator = document.getElementById("typing");

// 🎧 Audio 1 — Ambiente inicial (NO loop)
const ambienceIntro = new Audio("/varios/musica/ambiente-inicial.mp3");
ambienceIntro.volume = 0;
ambienceIntro.loop = false;

// 🎧 Audio 2 — Ambiente en bucle (loop infinito)
const ambienceLoop = new Audio("/varios/musica/ambiente-bucle.mp3");
ambienceLoop.volume = 0;
ambienceLoop.loop = true;

// ===============================
// 🔥 AUTOPLAY + FALLBACK
// ===============================

ambienceIntro.play().then(() => {
  fadeIn(ambienceIntro, 0.12); // volumen inicial suave
}).catch(() => {
  document.addEventListener("click", () => {
    ambienceIntro.play();
    fadeIn(ambienceIntro, 0.12);
  }, { once: true });
});

// ===============================
// 🔄 CUANDO TERMINA EL INICIAL → ENTRA EL LOOP
// ===============================

ambienceIntro.addEventListener("ended", () => {
  ambienceLoop.currentTime = 0;
  ambienceLoop.play();
  fadeIn(ambienceLoop, 0.18); // un poco más fuerte si querés
});

// ===============================
// 🌅 FUNCIÓN DE FADE-IN GENÉRICA
// ===============================

function fadeIn(audio, targetVolume) {
  let vol = 0;
  const fade = setInterval(() => {
    vol += 0.02;
    audio.volume = Math.min(vol, targetVolume);
    if (vol >= targetVolume) clearInterval(fade);
  }, 80);
}


// 🎧 Sonido cuando Yumiko responde
const yumikoSound = new Audio("/varios/musica/doing.mp3");
yumikoSound.volume = 0.85; // ting más fuerte

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  // Solo Yumiko tiene avatar
  if (sender === "bot") {
    const avatar = document.createElement("img");
    avatar.classList.add("avatar-small");
    avatar.src = "varios/yumiko/yumiko-face-full-face.png"; // ruta corregida
    message.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  message.appendChild(bubble);
  chatBox.appendChild(message);

  chatBox.scrollTop = chatBox.scrollHeight;
}

sendBtn.addEventListener("click", async () => {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";

  typingIndicator.classList.remove("hidden");

  // 🔥 Glow ON
  document.querySelector(".glow-yumiko").style.opacity = 1;

  // 🔥 Aura ON
  document.querySelector(".aura-yumiko").style.opacity = 1;
  document.querySelector(".aura-yumiko").style.transform = "scale(1.15)";

  try {
    const res = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    const data = await res.json();
    const reply = data.reply || "No pude procesar tu mensaje.";

    addMessage(reply, "bot");

    // 🎧 Sonido de Yumiko respondiendo
    yumikoSound.currentTime = 0;
    yumikoSound.play();

  } catch (error) {
    addMessage("Hubo un error al conectar con Yumiko.", "bot");
  }

  typingIndicator.classList.add("hidden");

  // 🔥 Glow OFF
  document.querySelector(".glow-yumiko").style.opacity = 0;

  // 🔥 Aura OFF
  document.querySelector(".aura-yumiko").style.opacity = 0;
  document.querySelector(".aura-yumiko").style.transform = "scale(1)";
});

// Parallax suave del dojo — PROFUNDO Y ARREGLADO
document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 20; // más profundidad
  const y = (e.clientY / window.innerHeight - 0.5) * 20;

  const wood = document.querySelector(".layer-wood");
  const shoji = document.querySelector(".layer-shoji");
  const pattern = document.querySelector(".layer-pattern");

  if (wood) wood.style.transform = `translate(${x}px, ${y}px)`;
  if (shoji) shoji.style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
  if (pattern) pattern.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
});
