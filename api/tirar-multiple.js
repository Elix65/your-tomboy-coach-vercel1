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

    const { user_id, cantidad } = req.body

    if (!user_id || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Faltan parámetros válidos' })
    }

    // 1. Obtener skins activas
    const { data: skins, error: skinsError } = await supabase
      .from('skins')
      .select('id, nombre, rareza, imagen_url, probabilidad')
      .eq('activa', true)

    if (skinsError) return res.status(500).json({ error: skinsError.message })
    if (!skins || skins.length === 0) {
      return res.status(500).json({ error: 'No hay skins activas' })
    }

    // Precalcular probabilidad total
    const totalProb = skins.reduce((sum, s) => sum + s.probabilidad, 0)

    const resultados = []
    const inventarioCambios = {}

    // 2. Realizar N tiradas
    for (let i = 0; i < cantidad; i++) {
      let random = Math.random() * totalProb
      let selectedSkin = null

      for (const skin of skins) {
        if (random < skin.probabilidad) {
          selectedSkin = skin
          break
        }
        random -= skin.probabilidad
      }

      resultados.push(selectedSkin)

      // Acumular cambios para inventario
      if (!inventarioCambios[selectedSkin.id]) {
        inventarioCambios[selectedSkin.id] = 1
      } else {
        inventarioCambios[selectedSkin.id]++
      }
    }

    // 3. Registrar tiradas en user_rolls (bulk insert)
    const rollsPayload = resultados.map(skin => ({
      user_id,
      skin_id: skin.id,
      tipo: 'comun', // tu enum válido
      cantidad: 1
    }))

    const { error: rollError } = await supabase
      .from('user_rolls')
      .insert(rollsPayload)

    if (rollError) return res.status(500).json({ error: rollError.message })

    // 4. Actualizar inventario
    for (const skin_id in inventarioCambios) {
      const cantidadGanada = inventarioCambios[skin_id]

      const { data: existing, error: invError } = await supabase
        .from('user_skins')
        .select('*')
        .eq('user_id', user_id)
        .eq('skin_id', skin_id)
        .maybeSingle()

      if (invError) return res.status(500).json({ error: invError.message })

      if (existing) {
        const { error: updateError } = await supabase
          .from('user_skins')
          .update({
            cantidad: existing.cantidad + cantidadGanada
          })
          .eq('id', existing.id)

        if (updateError) return res.status(500).json({ error: updateError.message })
      } else {
        const { error: insertError } = await supabase
          .from('user_skins')
          .insert({
            user_id,
            skin_id,
            cantidad: cantidadGanada,
            fecha_obtenida: new Date().toISOString()
          })

        if (insertError) return res.status(500).json({ error: insertError.message })
      }
    }

    // 5. Respuesta final
    return res.status(200).json({
      ok: true,
      cantidad,
      resultados
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
