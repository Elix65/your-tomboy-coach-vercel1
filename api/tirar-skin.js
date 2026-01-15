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

    const { user_id } = JSON.parse(req.body)

    if (!user_id) {
      return res.status(400).json({ error: 'Falta user_id' })
    }

    // 1. Obtener todas las skins activas
    const { data: skins, error: skinsError } = await supabase
      .from('skins')
      .select('*')
      .eq('activa', true)

    if (skinsError) {
      return res.status(500).json({ error: skinsError })
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
      return res.status(500).json({ error: rollError })
    }

    // 4. Actualizar inventario (users_skins)
    const { data: existing, error: invError } = await supabase
      .from('users_skins')
      .select('*')
      .eq('user_id', user_id)
      .eq('skin_id', selectedSkin.id)
      .maybeSingle()

    if (invError) {
      return res.status(500).json({ error: invError })
    }

    if (existing) {
      // Ya la tiene → sumar cantidad
      const { error: updateError } = await supabase
        .from('users_skins')
        .update({
          cantidad: existing.cantidad + 1
        })
        .eq('id', existing.id)

      if (updateError) {
        return res.status(500).json({ error: updateError })
      }
    } else {
      // No la tiene → crear registro
      const { error: insertError } = await supabase
        .from('users_skins')
        .insert({
          user_id,
          skin_id: selectedSkin.id,
          cantidad: 1,
          fecha_obtenida: new Date().toISOString()
        })

      if (insertError) {
        return res.status(500).json({ error: insertError })
      }
    }

    // 5. Respuesta final
    return res.status(200).json({
      ok: true,
      skin: selectedSkin
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}