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

async function ensureDefaultConversationId(supabaseAdmin, { userId } = {}) {
  if (!userId) {
    throw new Error('Missing userId for conversation resolution.');
  }

  const { data: existingConversation, error: findError } = await supabaseAdmin
    .from('conversations')
    .select('id,user_id,is_default,created_at')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message || 'Error reading default conversation.');
  }

  if (existingConversation?.id) {
    return String(existingConversation.id);
  }

  const { data: insertedConversation, error: insertError } = await supabaseAdmin
    .from('conversations')
    .insert({
      user_id: userId,
      is_default: true
    })
    .select('id,user_id,is_default,created_at')
    .single();

  if (insertError) {
    throw new Error(insertError.message || 'Error creating default conversation.');
  }

  return String(insertedConversation?.id || '');
}

function isMissingConversationsTable(error) {
  const message = String(error?.message || '');
  return message.includes("Could not find the table 'public.conversations'")
    || message.includes('relation "public.conversations" does not exist');
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

  let conversationId = null;
  let useLegacyInsert = false;

  try {
    conversationId = await ensureDefaultConversationId(supabaseAdmin, { userId });
  } catch (conversationError) {
    if (isMissingConversationsTable(conversationError)) {
      useLegacyInsert = true;
      console.warn('[yumiko][save-path][backend] conversations table unavailable, using legacy messages-only save path', {
        userId,
        sender,
        messageType,
        error: conversationError?.message || String(conversationError)
      });
    } else {
      throw conversationError;
    }
  }

  console.info('[yumiko][save-path][backend] persistMessage resolved conversation', {
    userId,
    conversationId
  });

  const insertPayload = useLegacyInsert
    ? {
        user_id: userId,
        sender,
        content,
        message_type: messageType
      }
    : {
        user_id: userId,
        conversation_id: conversationId,
        sender,
        content,
        message_type: messageType
      };

  console.info('[yumiko][save-path][backend] persistMessage inserting into public.messages', {
    userId,
    conversationId,
    sender,
    payload: insertPayload,
    useLegacyInsert
  });

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(insertPayload)
    .select('id,created_at')
    .single();

  if (error) {
    console.error('[yumiko][save-path][backend] persistMessage insert failed', {
      userId,
      conversationId,
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
    conversationId,
    sender,
    createdAt: data?.created_at || null
  });

  return data;
}

module.exports = {
  getRecentMessages,
  persistMessage
};
