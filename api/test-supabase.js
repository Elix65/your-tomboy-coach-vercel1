import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from('skins')
    .select('*')
    .limit(1)

  if (error) {
    return res.status(500).json({ error })
  }

  res.status(200).json({ ok: true, data })
}