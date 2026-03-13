async function getRecentMessages(supabaseAdmin, { userId, limit = 25, ascending = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id,sender,content,created_at,message_type,audio_out_path,tts_seconds')
    .eq('user_id', userId)
    .order('created_at', { ascending: Boolean(ascending) })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Error reading messages.');
  }

  return Array.isArray(data) ? data : [];
}

async function persistMessage(supabaseAdmin, { userId, sender, content, messageType = 'text' } = {}) {
  const payloadPreview = {
    user_id: userId,
    sender,
    content,
    message_type: messageType
  };

  console.info('[yumiko][save-path][backend] persistMessage enter', {
    userId,
    sender,
    messageType,
    contentLength: String(content || '').length,
    payload: payloadPreview
  });

  const insertPayload = {
    user_id: userId,
    sender,
    content,
    message_type: messageType
  };

  console.info('[yumiko][save-path][backend] persistMessage inserting into public.messages', {
    userId,
    sender,
    payload: insertPayload
  });

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(insertPayload)
    .select('id,created_at')
    .single();

  if (error) {
    console.error('[yumiko][save-path][backend] persistMessage insert failed', {
      userId,
      sender,
      messageType,
      payload: insertPayload,
      error: error.message || String(error),
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
    throw new Error(error.message || 'Error inserting message.');
  }

  console.info('[yumiko][save-path][backend] persisted message id=' + String(data?.id || ''), {
    userId,
    sender,
    createdAt: data?.created_at || null
  });

  return data;
}

module.exports = {
  getRecentMessages,
  persistMessage
};
