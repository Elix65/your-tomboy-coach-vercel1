import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    const user_id = req.query.user_id
    if (!user_id) {
      return res.status(400).json({ error: 'Falta user_id' })
    }

    // 1. Obtener inventario del usuario
    const { data: inventario, error: invError } = await supabase
      .from('user_skins')
      .select(`
        id,
        cantidad,
        fecha_obtenida,
        skins (
          id,
          nombre,
          rareza,
          imagen_url
        )
      `)
      .eq('user_id', user_id)
      .order('fecha_obtenida', { ascending: false })

    if (invError) {
      return res.status(500).json({ error: invError.message })
    }

    // 2. Formatear respuesta
    const resultado = inventario.map(item => ({
      skin_id: item.skins?.id,
      nombre: item.skins?.nombre,
      rareza: item.skins?.rareza,
      imagen_url: item.skins?.imagen_url,
      cantidad: item.cantidad,
      fecha_obtenida: item.fecha_obtenida
    }))

    return res.status(200).json({
      ok: true,
      total: resultado.length,
      inventario: resultado
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
