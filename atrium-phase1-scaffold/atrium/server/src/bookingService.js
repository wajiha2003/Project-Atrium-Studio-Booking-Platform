import { Prisma } from '@prisma/client'

export const ACTIVE_BOOKING_STATES = ['HELD', 'PENDING_PAYMENT', 'CONFIRMED']
const HOLD_MINUTES = 8
const CHECKOUT_MINUTES = 10
const BUFFER_MINUTES = 15
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }
const transitionMap = {
  DRAFT: ['HELD', 'CANCELLED'],
  HELD: ['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  FAILED: ['HELD', 'CANCELLED'],
  CANCELLED: ['REFUNDED'],
  EXPIRED: [],
  COMPLETED: [],
  REFUNDED: [],
  PENDING: ['HELD', 'CANCELLED']
}

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }) }
const minutes = value => value * 60 * 1000
const isHalfHour = date => date.getUTCMinutes() % 30 === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
const activeOverlap = (startTime, endTime, buffer = false) => ({
  startTime: { lt: new Date(endTime.getTime() + (buffer ? minutes(BUFFER_MINUTES) : 0)) },
  endTime: { gt: new Date(startTime.getTime() - (buffer ? minutes(BUFFER_MINUTES) : 0)) }
})

function scheduleAllows(schedule, startTime, endTime) {
  if (!schedule) return true
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = dayNames[startTime.getDay()]
  const endDay = dayNames[endTime.getDay()]
  if (day !== endDay) return false
  const line = schedule.split(';').map(value => value.trim()).find(value => value.startsWith(`${day}-`) || value.startsWith(`${day} `) || value.startsWith('Mon-Fri') || value.startsWith('Sat-Sun') || value.startsWith('Mon-Sun'))
  if (!line) return false
  const match = line.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/)
  if (!match) return true
  const [, openHour, openMinute, closeHour, closeMinute] = match.map(Number)
  const open = openHour * 60 + openMinute
  const close = closeHour * 60 + closeMinute
  const start = startTime.getHours() * 60 + startTime.getMinutes()
  const end = endTime.getHours() * 60 + endTime.getMinutes()
  return start >= open && end <= close
}

function validateWindow(room, venue, startTime, endTime, now = new Date()) {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) fail('End time must be after start time', 400)
  if (!isHalfHour(startTime) || !isHalfHour(endTime)) fail('Bookings must use 30 minute increments', 400)
  const duration = (endTime - startTime) / 3600000
  if (duration < 1 || duration > 8 || duration < room.minDuration || duration > room.maxDuration) fail('Booking duration is outside the room limits', 400)
  if (startTime < new Date(now.getTime() + minutes(60)) || startTime > new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)) fail('Bookings must be made between 1 hour and 90 days ahead', 400)
  if (!scheduleAllows(venue.operatingSchedule, startTime, endTime)) fail('Booking is outside venue operating hours', 409)
}

async function expireHolds(tx, actorId) {
  const now = new Date()
  const expired = await tx.booking.findMany({ where: { status: 'HELD', expiresAt: { lte: now } }, select: { id: true, status: true } })
  for (const booking of expired) {
    await tx.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED', expiresAt: null } })
    await tx.auditEvent.create({ data: { actorId, bookingId: booking.id, fromState: 'HELD', toState: 'EXPIRED', reason: 'Hold TTL elapsed' } })
  }
}

async function assertInventory(tx, roomId, venueId, startTime, endTime, lineItems, excludeBookingId) {
  const roomBookings = await tx.booking.findMany({ where: { roomId, id: excludeBookingId ? { not: excludeBookingId } : undefined, status: { in: ACTIVE_BOOKING_STATES }, ...activeOverlap(startTime, endTime, true) }, select: { id: true } })
  if (roomBookings.length) fail('Room is unavailable for this interval', 409)
  const overlapping = await tx.booking.findMany({ where: { venueId, id: excludeBookingId ? { not: excludeBookingId } : undefined, status: { in: ACTIVE_BOOKING_STATES }, ...activeOverlap(startTime, endTime) }, include: { lineItems: true } })
  for (const item of lineItems) {
    const reserved = overlapping.reduce((sum, booking) => sum + booking.lineItems.filter(line => line.equipmentTypeId === item.equipmentTypeId).reduce((lineSum, line) => lineSum + line.quantity, 0), 0)
    const equipment = await tx.equipmentType.findUnique({ where: { id: item.equipmentTypeId } })
    if (!equipment || equipment.venueId !== venueId || reserved + item.quantity > equipment.totalUnits) fail(`Equipment ${item.equipmentTypeId} is over capacity`, 409)
  }
}

export async function createBooking(prisma, input, actorId) {
  const startTime = new Date(input.startTime)
  const endTime = new Date(input.endTime)
  const lineItems = (input.lineItems || []).filter(item => Number(item.quantity) > 0).map(item => ({ equipmentTypeId: Number(item.equipmentTypeId), quantity: Number(item.quantity) }))
  return prisma.$transaction(async tx => {
    await expireHolds(tx, actorId)
    const room = await tx.room.findUnique({ where: { id: Number(input.roomId) }, include: { venue: true } })
    if (!room) fail('Room not found', 404)
    validateWindow(room, room.venue, startTime, endTime)
    await assertInventory(tx, room.id, room.venueId, startTime, endTime, lineItems)
    const duration = (endTime - startTime) / 3600000
    const equipment = await tx.equipmentType.findMany({ where: { id: { in: lineItems.map(item => item.equipmentTypeId) } } })
    const totalAmount = Number((Number(room.hourlyRate) * duration + lineItems.reduce((sum, item) => sum + Number(equipment.find(entry => entry.id === item.equipmentTypeId)?.hourlyRate || 0) * item.quantity * duration, 0)).toFixed(2))
    const booking = await tx.booking.create({ data: { reference: `BK-${Date.now().toString().slice(-7)}`, userId: Number(input.userId || actorId), roomId: room.id, venueId: room.venueId, startTime, endTime, status: 'HELD', expiresAt: new Date(Date.now() + minutes(HOLD_MINUTES)), checkoutExpiresAt: new Date(Date.now() + minutes(CHECKOUT_MINUTES)), totalAmount, lineItems: { create: lineItems } }, include: { user: true, room: true, venue: true, lineItems: { include: { equipmentType: true } } } })
    await tx.auditEvent.create({ data: { actorId, bookingId: booking.id, fromState: 'DRAFT', toState: 'HELD', reason: 'Booking hold created' } })
    return booking
  }, transactionOptions)
}

export async function transitionBooking(prisma, bookingId, toState, actorId, reason = 'Explicit state transition') {
  return prisma.$transaction(async tx => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } })
    if (!booking) fail('Booking not found', 404)
    if (!(transitionMap[booking.status] || []).includes(toState)) fail(`Illegal transition ${booking.status} -> ${toState}`)
    if (booking.status === 'HELD' && booking.expiresAt && booking.expiresAt <= new Date() && toState !== 'EXPIRED') fail('Hold has expired')
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: toState, expiresAt: toState === 'HELD' ? booking.expiresAt : null } })
    await tx.auditEvent.create({ data: { actorId, bookingId, fromState: booking.status, toState, reason } })
    return updated
  }, transactionOptions)
}

export async function submitPayment(prisma, bookingId, actorId, idempotencyKey) {
  if (!idempotencyKey) fail('Idempotency-Key is required', 400)
  return prisma.$transaction(async tx => {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey } })
    if (existing) return existing
    const booking = await tx.booking.findUnique({ where: { id: bookingId } })
    if (!booking) fail('Booking not found', 404)
    if (booking.status === 'HELD' && booking.expiresAt <= new Date()) fail('Hold has expired')
    if (booking.status !== 'HELD') fail('Only held bookings can enter payment')
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'PENDING_PAYMENT' } })
    await tx.auditEvent.create({ data: { actorId, bookingId, fromState: 'HELD', toState: 'PENDING_PAYMENT', reason: 'Payment submitted' } })
    return tx.payment.create({ data: { bookingId, amount: booking.totalAmount, idempotencyKey, status: 'INITIATED' } })
  }, transactionOptions)
}

export async function handlePaymentWebhook(prisma, payload, actorId) {
  const { bookingId, idempotencyKey, webhookEventId, providerReference, outcome } = payload
  if (!idempotencyKey || !webhookEventId) fail('idempotencyKey and webhookEventId are required', 400)
  return prisma.$transaction(async tx => {
    const duplicate = await tx.payment.findFirst({ where: { OR: [{ idempotencyKey }, { webhookEventId }] } })
    if (duplicate) return duplicate
    const booking = await tx.booking.findUnique({ where: { id: Number(bookingId) } })
    if (!booking) fail('Booking not found', 404)
    const expired = booking.status === 'EXPIRED' || (booking.expiresAt && booking.expiresAt <= new Date())
    if (outcome === 'CAPTURED' && (expired || booking.status !== 'PENDING_PAYMENT')) {
      const payment = await tx.payment.create({ data: { bookingId: booking.id, amount: booking.totalAmount, idempotencyKey, webhookEventId, providerReference, status: 'REFUNDED', refundedAt: new Date() } })
      if (booking.status === 'PENDING_PAYMENT') {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED', expiresAt: null } })
        await tx.auditEvent.create({ data: { actorId, bookingId: booking.id, fromState: 'PENDING_PAYMENT', toState: 'EXPIRED', reason: 'Payment arrived after hold expiry; automatic refund issued' } })
      }
      return payment
    }
    const status = outcome === 'CAPTURED' ? 'CAPTURED' : 'FAILED'
    const payment = await tx.payment.create({ data: { bookingId: booking.id, amount: booking.totalAmount, idempotencyKey, webhookEventId, providerReference, status, capturedAt: status === 'CAPTURED' ? new Date() : undefined } })
    const nextState = status === 'CAPTURED' ? 'CONFIRMED' : 'FAILED'
    await tx.booking.update({ where: { id: booking.id }, data: { status: nextState, expiresAt: null } })
    await tx.auditEvent.create({ data: { actorId, bookingId: booking.id, fromState: booking.status, toState: nextState, reason: `Payment webhook ${outcome}` } })
    return payment
  }, transactionOptions)
}

export async function reconciliationReport(prisma) {
  const [captured, confirmed] = await Promise.all([
    prisma.payment.findMany({ where: { status: 'CAPTURED' }, include: { booking: true } }),
    prisma.booking.findMany({ where: { status: 'CONFIRMED' }, include: { payments: true } })
  ])
  const discrepancies = []
  for (const payment of captured) if (payment.booking.status !== 'CONFIRMED') discrepancies.push({ type: 'CAPTURE_WITHOUT_CONFIRMATION', paymentId: payment.id, bookingId: payment.bookingId })
  for (const booking of confirmed) if (!booking.payments.some(payment => payment.status === 'CAPTURED')) discrepancies.push({ type: 'CONFIRMED_WITHOUT_CAPTURE', bookingId: booking.id })
  return { capturedCharges: captured.length, confirmedBookings: confirmed.length, discrepancies, ok: discrepancies.length === 0 }
}
