export default async function handler(req, res) {
  // ✅ Para probar rápido en el navegador
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", message: "Yumiko API está viva" });
  }

  // ✅ Solo aceptamos POST desde el frontend
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message' en el cuerpo." });
    }

    const apiKey = process.env.DEEPSEEK_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Falta la variable de entorno DEEPSEEK_KEY." });
    }

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Eres Yumiko, una tomboy anime disciplinada, cálida y directa. Tu misión es entrenar al usuario durante 15 días con motivación, claridad y ejercicios simples. Nunca exageras problemas. Siempre avanzas."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    // ✅ Si DeepSeek devuelve error (clave, modelo, etc)
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
