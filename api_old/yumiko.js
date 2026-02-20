import fs from "fs";
import path from "path";

// ===============================
// MEMORIA DEL DOJO (BACKEND)
// ===============================
global.yumikoSession = global.yumikoSession || {
  meta: null,
  name: null,
  challengeStart: null
};

// Detectar meta automáticamente
function detectarMeta(texto) {
  const t = texto.toLowerCase();

  if (t.includes("ingresos") && t.includes("uber")) {
    return "aumentar ingresos como conductor de Uber en 15 días";
  }

  return null;
}

// Calcular día del reto
function calcularDia(startDate) {
  if (!startDate) return null;

  const start = new Date(startDate);
  const now = new Date();

  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}

function sanitizeMessages(messages = []) {
  return messages
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string")
    .slice(-20)
    .map((msg) => ({ role: msg.role, content: msg.content }));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", message: "Yumiko API está viva" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { message, profile, messages: incomingMessages, summary } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message' en el cuerpo." });
    }

    const apiKey = process.env.DEEPSEEK_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Falta la variable de entorno DEEPSEEK_KEY." });
    }

    // ===============================
    // SINCRONIZAR PERFIL DEL FRONTEND
    // ===============================
    if (profile?.name) {
      global.yumikoSession.name = profile.name;
    }

    if (profile?.goal) {
      global.yumikoSession.meta = profile.goal;
    }

    if (profile?.challengeStart) {
      global.yumikoSession.challengeStart = profile.challengeStart;
    }

    // ===============================
    // DETECTAR META AUTOMÁTICAMENTE
    // ===============================
    const posibleMeta = detectarMeta(message);
    if (posibleMeta) {
      global.yumikoSession.meta = posibleMeta;

      // Si no había fecha de inicio, la creamos
      if (!global.yumikoSession.challengeStart) {
        global.yumikoSession.challengeStart = new Date().toISOString();
      }
    }

    const dia = calcularDia(global.yumikoSession.challengeStart);

    // ===============================
    // CARGAR PROMPT BASE
    // ===============================
    const promptPath = path.join(process.cwd(), "prompt.txt");
    const basePrompt = fs.readFileSync(promptPath, "utf8");

    // ===============================
    // CONSTRUIR MENSAJES PARA DEEPSEEK
    // ===============================
    const contextMessages = sanitizeMessages(incomingMessages);
    const messages = [
      { role: "system", content: basePrompt }
    ];

    if (global.yumikoSession.name) {
      messages.push({
        role: "system",
        content: `El nombre del usuario es ${global.yumikoSession.name}.`
      });
    }

    if (global.yumikoSession.meta) {
      messages.push({
        role: "system",
        content: `La meta del usuario es: ${global.yumikoSession.meta}.`
      });
    }

    if (dia) {
      messages.push({
        role: "system",
        content: `Hoy es el día ${dia} del reto de 15 días.`
      });
    }

    if (summary) {
      messages.push({
        role: "system",
        content: `Resumen de memoria previa del chat: ${summary}`
      });
    }

    if (contextMessages.length > 0) {
      messages.push(...contextMessages);
    } else {
      messages.push({ role: "user", content: message });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[yumiko] context payload", {
        summaryIncluded: Boolean(summary),
        contextCount: contextMessages.length,
        totalMessagesSent: messages.length
      });
    }

    // ===============================
    // LLAMADA A DEEPSEEK
    // ===============================
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || "Error desconocido desde DeepSeek.";
      return res.status(500).json({ reply: `Yumiko no pudo responder: ${errorMsg}` });
    }

    const reply = data?.choices?.[0]?.message?.content || "Yumiko no generó respuesta.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Error en /api/yumiko:", error);
    return res.status(500).json({ reply: "Error interno en la API de Yumiko." });
  }
}
