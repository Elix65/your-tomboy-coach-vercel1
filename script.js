const chatBox = document.getElementById("chat-box");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
<<<<<<< HEAD
const typing = document.getElementById("typing");
=======
>>>>>>> 0b2a9a1dc9c901d8ceffac29c6a027b9fe906b20

function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
<<<<<<< HEAD

  const avatar = document.createElement("img");
  avatar.classList.add("avatar");

  avatar.src = sender === "user"
    ? "https://i.imgur.com/1XKQFQ2.png"
    : "https://i.imgur.com/8Km9tLL.png";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(bubble);

=======
  msg.textContent = text;
>>>>>>> 0b2a9a1dc9c901d8ceffac29c6a027b9fe906b20
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

<<<<<<< HEAD
  typing.classList.remove("hidden");

=======
>>>>>>> 0b2a9a1dc9c901d8ceffac29c6a027b9fe906b20
  const response = await fetch("/api/yumiko", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  });

  const data = await response.json();
<<<<<<< HEAD

  typing.classList.add("hidden");

=======
>>>>>>> 0b2a9a1dc9c901d8ceffac29c6a027b9fe906b20
  addMessage(data.reply, "bot");
}
