export default async function handler(req, res) {
  const { message } = req.body;
  const apiKey = process.env.DEEPSEEK_KEY;

  try {
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

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ reply: "Yumiko no pudo procesar tu mensaje. Verificá la clave o el modelo." });
    }

    const reply = data.choices[0].message.content;
    res.status(200).json({ reply });

  } catch (error) {
    res.status(500).json({ reply: "Error al conectar con DeepSeek. Verificá la clave o el endpoint." });
  }
}
