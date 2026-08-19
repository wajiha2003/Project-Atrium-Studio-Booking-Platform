const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000'

export async function createHold(body: any) {
  const res = await fetch(`${API_BASE}/bookings/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`HTTP ${res.status}: ${txt}`)
  }
  return res.json()
}
