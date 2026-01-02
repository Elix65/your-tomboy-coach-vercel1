const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const typingIndicator = document.getElementById("typing");

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
  document.querySelector(".glow-yumiko").style.opacity = 1;

  try {
    // 🔥 LLAMADA REAL AL BACKEND
    const res = await fetch("/api/yumiko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    const data = await res.json();
    const reply = data.reply || "No pude procesar tu mensaje.";

    addMessage(reply, "bot");

  } catch (error) {
    addMessage("Hubo un error al conectar con Yumiko.", "bot");
  }

  typingIndicator.classList.add("hidden");
  document.querySelector(".glow-yumiko").style.opacity = 0;
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
