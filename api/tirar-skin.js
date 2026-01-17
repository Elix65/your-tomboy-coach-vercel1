import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    console.log('🔍 URL usada:', process.env.SUPABASE_URL)
    console.log('🔍 KEY empieza:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 15))
    console.log('🔍 Entorno:', process.env.NODE_ENV)

    const { data: skins, error: skinsError } = await supabase
      .from('skins')
      .select('*')
      .eq('activa', true)

    console.log('🔍 Skins recibidas:', skins)
    console.log('🔍 Error en consulta:', skinsError)

    if (skinsError) {
      return res.status(500).json({ error: skinsError.message || 'Error al consultar skins' })
    }

    if (!skins || skins.length === 0) {
      return res.status(500).json({ error: 'No hay skins activas' })
    }

    return res.status(200).json({
      ok: true,
      count: skins.length,
      skins
    })

  } catch (err) {
    console.error('🔥 Error inesperado:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
