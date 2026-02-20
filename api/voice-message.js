const fs = require("fs");
const { formidable } = require("formidable");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openAiApiKey });

function parseForm(req) {
  const form = formidable({ multiples: false, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function estimateTtsSeconds(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Number(((words / 150) * 60).toFixed(1)));
}

async function uploadBuffer(bucket, key, body, contentType) {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(key, body, {
    upsert: true,
    contentType
  });

  if (error) {
    throw new Error(`upload ${bucket} failed: ${error.message}`);
  }
}

async function getSignedUrl(bucket, key) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(key, 3600);
  if (error) {
    throw new Error(`signed url ${bucket} failed: ${error.message}`);
  }
  return data.signedUrl;
}

async function getRecentUserContext(userId) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("content, transcript, created_at")
    .eq("user_id", userId)
    .eq("sender", "user")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) return [];

  return [...data]
    .reverse()
    .map((row) => row.transcript || row.content)
    .filter(Boolean)
    .map((text) => ({ role: "user", content: text }));
}

async function transcribeAudio(audioBuffer) {
  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(audioBuffer, "voice.webm", { type: "audio/webm" }),
    model: "gpt-4o-mini-transcribe"
  });

  return transcription?.text || "";
}

async function buildYumikoReply(transcript, userContext) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: "Sos Yumiko: tomboy cálida, directa y protectora. Hablá en español rioplatense. Respuestas breves (1 a 4 frases). Cerrá SIEMPRE con 'Usuario-kun'."
      },
      ...userContext,
      { role: "user", content: transcript }
    ]
  });

  return response?.choices?.[0]?.message?.content?.trim() || "Acá estoy para vos, Usuario-kun";
}

async function ttsElevenLabs(text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2"
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`ElevenLabs error: ${response.status} ${details}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !supabaseServiceKey || !openAiApiKey || !elevenLabsApiKey || !elevenLabsVoiceId) {
    return res.status(500).json({
      error: "Faltan variables de entorno requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID"
    });
  }

  const jwt = getBearerToken(req);
  if (!jwt) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !authData?.user?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = authData.user.id;
    const { files } = await parseForm(req);
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;

    if (!audioFile?.filepath) {
      return res.status(400).json({ error: "Missing 'audio' file" });
    }

    const audioBuffer = fs.readFileSync(audioFile.filepath);
    const transcript = await transcribeAudio(audioBuffer);
    const userContext = await getRecentUserContext(userId);
    const replyText = await buildYumikoReply(transcript, userContext);
    const ttsBuffer = await ttsElevenLabs(replyText);
    const ttsSeconds = estimateTtsSeconds(replyText);

    const { data: userInsert, error: userInsertError } = await supabaseAdmin
      .from("messages")
      .insert({
        user_id: userId,
        sender: "user",
        message_type: "audio",
        transcript,
        content: transcript
      })
      .select("id")
      .single();

    if (userInsertError) {
      throw new Error(`user message insert failed: ${userInsertError.message}`);
    }

    const userMsgId = userInsert.id;
    const audioInKey = `${userId}/${userMsgId}.webm`;
    await uploadBuffer("user-audio", audioInKey, audioBuffer, "audio/webm");

    const { error: userUpdateError } = await supabaseAdmin
      .from("messages")
      .update({ audio_in_path: audioInKey })
      .eq("id", userMsgId);

    if (userUpdateError) {
      throw new Error(`user message update failed: ${userUpdateError.message}`);
    }

    const { data: yumikoInsert, error: yumikoInsertError } = await supabaseAdmin
      .from("messages")
      .insert({
        user_id: userId,
        sender: "yumiko",
        message_type: "audio",
        content: replyText,
        tts_seconds: ttsSeconds
      })
      .select("id")
      .single();

    if (yumikoInsertError) {
      throw new Error(`yumiko message insert failed: ${yumikoInsertError.message}`);
    }

    const yumikoMsgId = yumikoInsert.id;
    const audioOutKey = `${userId}/${yumikoMsgId}.mp3`;
    await uploadBuffer("yumiko-audio", audioOutKey, ttsBuffer, "audio/mpeg");

    const { error: yumikoUpdateError } = await supabaseAdmin
      .from("messages")
      .update({ audio_out_path: audioOutKey })
      .eq("id", yumikoMsgId);

    if (yumikoUpdateError) {
      throw new Error(`yumiko message update failed: ${yumikoUpdateError.message}`);
    }

    const audioInSignedUrl = await getSignedUrl("user-audio", audioInKey);
    const audioOutSignedUrl = await getSignedUrl("yumiko-audio", audioOutKey);

    fs.unlink(audioFile.filepath, () => {});

    return res.status(200).json({
      user_message_id: userMsgId,
      yumiko_message_id: yumikoMsgId,
      transcript,
      reply_text: replyText,
      audio_in_signed_url: audioInSignedUrl,
      audio_out_signed_url: audioOutSignedUrl,
      audio_in_key: audioInKey,
      audio_out_key: audioOutKey,
      tts_seconds: ttsSeconds
    });
  } catch (error) {
    console.error("voice-message error", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
