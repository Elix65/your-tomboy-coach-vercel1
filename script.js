const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const typingIndicator = document.getElementById("typing");

// 🎧 Sonido ambiente del dojo (FASE 8 — fade-in)
const dojoAmbience = new Audio("/varios/musica/ambient.mp3");
dojoAmbience.volume = 0; // empieza en silencio para el fade-in
dojoAmbience.loop = true;

// Intento de autoplay (si falla, se activa al primer click)
dojoAmbience.play().catch(() => {
  document.addEventListener("click", () => dojoAmbience.play(), { once: true });
});


// Fade-in más rápido y más inmediato
let vol = 0;
const fadeIn = setInterval(() => {
  vol += 0.03; // antes 0.01
  dojoAmbience.volume = Math.min(vol, 0.15);
  if (vol >= 0.15) clearInterval(fadeIn);
}, 80); // antes 120


// 🎧 Sonido cuando Yumiko responde
const yumikoSound = new Audio("/varios/musica/doing.mp3");
yumikoSound.volume = 0.65;

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  const avatar = document.createElement("img");
  avatar.classList.add("avatar-small");
  avatar.src = sender === "user"
    ? "https://cdn-icons-png.flaticon.com/512/847/847969.png"
    : "https://copilot.microsoft.com/th/id/BCO.71c599d0-e7fb-4f35-aca0-f60954cec101.png";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  message.appendChild(avatar);
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

// Parallax suave del dojo
document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 10;
  const y = (e.clientY / window.innerHeight - 0.5) * 10;

  const wood = document.querySelector(".layer-wood");
  const shoji = document.querySelector(".layer-shoji");
  const pattern = document.querySelector(".layer-pattern");

  if (wood) wood.style.transform = `translate(${x}px, ${y}px)`;
  if (shoji) shoji.style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
  if (pattern) pattern.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
});
