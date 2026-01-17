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

    const { user_id } = req.body
    if (!user_id) {
      return res.status(400).json({ error: 'Falta user_id' })
    }

    // 1. Obtener todas las skins activas
    const { data: skins, error: skinsError } = await supabase
      .from('skins')
      .select('*')
      .filter('activa', 'eq', true)

    console.log('🔍 Skins recibidas:', skins)
    console.log('🔍 Error en consulta:', skinsError)

    if (skinsError) {
      return res.status(500).json({ error: skinsError.message || 'Error al consultar skins' })
    }

    if (!skins || skins.length === 0) {
      return res.status(500).json({ error: 'No hay skins activas' })
    }

    // 2. Selección probabilística
    const totalProb = skins.reduce((sum, s) => sum + s.probabilidad, 0)
    let random = Math.random() * totalProb
    let selectedSkin = null

    for (const skin of skins) {
      if (random < skin.probabilidad) {
        selectedSkin = skin
        break
      }
      random -= skin.probabilidad
    }

    if (!selectedSkin) {
      return res.status(500).json({ error: 'No se pudo seleccionar skin' })
    }

    // 3. Registrar tirada en user_rolls
    const { error: rollError } = await supabase
      .from('user_rolls')
      .insert({
        user_id,
        skin_id: selectedSkin.id,
        tipo: 'single',
        cantidad: 1
      })

    if (rollError) {
      return res.status(500).json({ error: rollError.message || 'Error al registrar tirada' })
    }

    // 4. Actualizar inventario (users_skins)
    const { data: existing, error: invError } = await supabase
      .from('users_skins')
      .select('*')
      .eq('user_id', user_id)
      .eq('skin_id', selectedSkin.id)
      .maybeSingle()

    if (invError) {
      return res.status(500).json({ error: invError.message || 'Error al consultar inventario' })
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('users_skins')
        .update({
          cantidad: existing.cantidad + 1
        })
        .eq('id', existing.id)

      if (updateError) {
        return res.status(500).json({ error: updateError.message || 'Error al actualizar inventario' })
      }
    } else {
      const { error: insertError } = await supabase
        .from('users_skins')
        .insert({
          user_id,
          skin_id: selectedSkin.id,
          cantidad: 1,
          fecha_obtenida: new Date().toISOString()
        })

      if (insertError) {
        return res.status(500).json({ error: insertError.message || 'Error al insertar inventario' })
      }
    }

    // 5. Respuesta final
    return res.status(200).json({
      ok: true,
      skin: selectedSkin
    })

  } catch (err) {
    console.error('🔥 Error inesperado:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
