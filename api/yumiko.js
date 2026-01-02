export default async function handler(req, res) {
  const { message } = req.body;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_KEY}`,
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
  const reply = data.choices[0].message.content;

  res.status(200).json({ reply });
}
