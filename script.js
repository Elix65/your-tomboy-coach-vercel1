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

sendBtn.addEventListener("click", () => {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";

  typingIndicator.classList.remove("hidden");

  setTimeout(() => {
    typingIndicator.classList.add("hidden");
    addMessage("Estoy procesando tu mensaje…", "bot");
  }, 1000);
});
