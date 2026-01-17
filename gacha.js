const userId = 'TU_UUID_ACÁ' // luego lo reemplazamos por algo dinámico

const btnUna = document.getElementById('tirar-una')
const btnDiez = document.getElementById('tirar-diez')
const divResultado = document.getElementById('resultado')

btnUna.addEventListener('click', async () => {
  const res = await fetch('/api/tirar-skin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId })
  })
  const data = await res.json()
  divResultado.textContent = `Te salió: ${data.skin.nombre} (${data.skin.rareza})`
})

btnDiez.addEventListener('click', async () => {
  const res = await fetch('/api/tirar-multiple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, cantidad: 10 })
  })
  const data = await res.json()
  divResultado.innerHTML = data.resultados
    .map(s => `${s.nombre} (${s.rareza})`)
    .join('<br>')
})
