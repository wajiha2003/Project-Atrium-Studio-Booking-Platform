import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { app, setPrismaClient } from '../src/index.js'

const secret = process.env.JWT_SECRET || 'development-secret'

test('venue admin cannot read valid Venue B booking or room ids', async () => {
  const venueA = { id: 101, name: 'Venue A' }
  const venueB = { id: 202, name: 'Venue B' }
  const adminA = { id: 1, role: 'VENUE_ADMIN', venueId: venueA.id }
  const roomB = { id: 22, venueId: venueB.id, name: 'Room B' }
  const bookingB = { id: 33, venueId: venueB.id, userId: 7, reference: 'BOOKING-B' }
  setPrismaClient({
    room: {
      findUnique: async ({ where }) => where.id === roomB.id ? { venueId: roomB.venueId } : null,
      findUniqueOrThrow: async ({ where }) => where.id === roomB.id ? roomB : (() => { throw new Error('not found') })()
    },
    booking: {
      findUnique: async ({ where }) => where.id === bookingB.id ? { venueId: bookingB.venueId, userId: bookingB.userId } : null,
      findUniqueOrThrow: async ({ where }) => where.id === bookingB.id ? bookingB : (() => { throw new Error('not found') })()
    }
  })
  const token = jwt.sign(adminA, secret)
  const server = createServer(app)
  await new Promise(resolve => server.listen(0, resolve))
  const port = server.address().port
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const bookingResponse = await fetch(`http://localhost:${port}/api/bookings/${bookingB.id}`, { headers })
    const roomResponse = await fetch(`http://localhost:${port}/api/rooms/${roomB.id}`, { headers })
    assert.ok([403, 404].includes(bookingResponse.status), `expected 403/404, got ${bookingResponse.status}`)
    assert.ok([403, 404].includes(roomResponse.status), `expected 403/404, got ${roomResponse.status}`)
    assert.equal((await bookingResponse.text()).includes(bookingB.reference), false)
    assert.equal((await roomResponse.text()).includes(roomB.name), false)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
