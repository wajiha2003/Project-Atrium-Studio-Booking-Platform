import React, { useState } from 'react'
import { createHold } from './api'

export default function App() {
  const [roomId, setRoomId] = useState('room-1')
  const [start, setStart] = useState('2026-08-20T10:00')
  const [end, setEnd] = useState('2026-08-20T11:00')
  const [equipmentJson, setEquipmentJson] = useState('[]')
  const [result, setResult] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult('...')
    try {
      const equipment = JSON.parse(equipmentJson)
      const res = await createHold({ userId: 'user-demo', roomId, start, end, equipment })
      setResult(JSON.stringify(res, null, 2))
    } catch (err: any) {
      setResult(String(err?.message || err))
    }
  }

  return (
    <div className="container">
      <h1>Atrium — Hold demo</h1>
      <form onSubmit={onSubmit} className="form">
        <label>Room ID
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
        </label>
        <label>Start
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>End
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label>Equipment JSON ([{`{\"equipmentTypeId\":\"id\",\"quantity\":1}`}])
          <textarea value={equipmentJson} onChange={(e) => setEquipmentJson(e.target.value)} rows={4} />
        </label>
        <button type="submit">Create Hold</button>
      </form>

      <h2>Result</h2>
      <pre className="result">{result}</pre>
    </div>
  )
}
