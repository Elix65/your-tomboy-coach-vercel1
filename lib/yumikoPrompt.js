const fs = require('fs');
const path = require('path');

let cachedPrompt = null;

function loadBasePrompt() {
  if (cachedPrompt) return cachedPrompt;
  const promptPath = path.join(process.cwd(), 'prompt.txt');
  cachedPrompt = fs.readFileSync(promptPath, 'utf8');
  return cachedPrompt;
}

function buildYumikoSystemMessages({ mode = 'chat-reply', session = {}, summary = '' } = {}) {
  const messages = [{ role: 'system', content: loadBasePrompt() }];

  if (session?.name) {
    messages.push({ role: 'system', content: `El nombre del usuario es ${session.name}.` });
  }

  if (session?.meta) {
    messages.push({ role: 'system', content: `La meta del usuario es: ${session.meta}.` });
  }

  if (session?.day) {
    messages.push({ role: 'system', content: `Hoy es el día ${session.day} del reto de 15 días.` });
  }

  if (summary) {
    messages.push({ role: 'system', content: `Resumen de memoria previa del chat: ${summary}` });
  }

  if (mode === 'chat-reply') {
    messages.push({ role: 'system', content: 'Modo: chat-reply. Respondé directamente al mensaje del usuario y mantené continuidad con el hilo reciente.' });
  }

  if (mode === 'auto-nudge') {
    messages.push({
      role: 'system',
      content: 'Modo: auto-nudge. Generá un solo mensaje espontáneo, cálido y breve (máximo 2 frases), con 1 intención clara, conectado al hilo reciente. No uses listas ni bloques largos.'
    });
  }

  return messages;
}

module.exports = {
  loadBasePrompt,
  buildYumikoSystemMessages
};
