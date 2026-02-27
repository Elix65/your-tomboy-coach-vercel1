const widget = document.getElementById('yumiko-widget');
const avatar = document.getElementById('yumiko-avatar');
const bubble = document.getElementById('yumiko-bubble');
const chat = document.getElementById('yumiko-chat');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');

function setMode(mode) {
  const isChat = mode === 'chat';
  widget.dataset.mode = isChat ? 'chat' : 'focus';
  chat.hidden = !isChat;
  bubble.textContent = isChat ? 'Modo chat activado ✨' : '¿Me contás qué hacés?';
  if (isChat) input.focus();
}

function toggleMode() {
  setMode(widget.dataset.mode === 'focus' ? 'chat' : 'focus');
}

avatar?.addEventListener('click', toggleMode);
bubble?.addEventListener('click', toggleMode);

send?.addEventListener('click', () => {
  if (!input.value.trim()) return;
  bubble.textContent = `Yumiko: ${input.value.trim().slice(0, 60)}`;
  input.value = '';
  setMode('focus');
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') send.click();
  if (event.key === 'Escape') setMode('focus');
});

setMode('focus');
