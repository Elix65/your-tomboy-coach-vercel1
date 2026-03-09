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
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      user_id: userId,
      sender,
      content,
      message_type: messageType
    })
    .select('id,created_at')
    .single();

  if (error) {
    throw new Error(error.message || 'Error inserting message.');
  }

  console.info('[yumiko][message-store] persisted message id=' + String(data?.id || ''), {
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
