import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { createBooking, handlePaymentWebhook, reconciliationReport, submitPayment, transitionBooking } from './bookingService.js'

const app = express()
let prisma = new PrismaClient()
const port = process.env.PORT || 4000
const jwtSecret = process.env.JWT_SECRET || 'development-secret'

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.CLIENT_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json())

const publicUser = user => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, name: `${user.firstName} ${user.lastName}`, email: user.email, role: user.role, venueId: user.venueId })
const signToken = user => jwt.sign({ id: user.id, role: user.role, venueId: user.venueId }, jwtSecret, { expiresIn: '7d' })
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const auth = (req, res, next) => { try { const header = req.headers.authorization || ''; if (!header.startsWith('Bearer ')) throw new Error('Missing token'); req.user = jwt.verify(header.slice(7), jwtSecret); next() } catch { res.status(401).json({ error: 'Authentication required' }) } }
const allowRoles = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' })
const scopedVenueWhere = user => user.role === 'PLATFORM_ADMIN' || user.role === 'CUSTOMER' ? {} : { venueId: user.venueId ?? -1 }
const scopedUserWhere = user => user.role === 'PLATFORM_ADMIN' ? {} : user.role === 'CUSTOMER' ? { id: user.id } : { venueId: user.venueId ?? -1 }
const canAccessVenue = (user, venueId) => user.role === 'PLATFORM_ADMIN' || user.role === 'CUSTOMER' || Number(user.venueId) === Number(venueId)
const resourceVenueId = async (model, req) => {
  const record = await prisma[model].findUnique({ where: { id: id(req.params.id) }, select: { id: true, venueId: true } })
  const customerOwnsUser = model === 'user' && req.user.role === 'CUSTOMER' && record?.id === req.user.id
  if (!record || (!customerOwnsUser && !canAccessVenue(req.user, record.venueId))) throw Object.assign(new Error('Record not found'), { status: 404 })
  return record.venueId
}
const scopeBooking = async (req, bookingId) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true, venueId: true } })
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 })
  const allowed = req.user.role === 'PLATFORM_ADMIN' || (req.user.role === 'CUSTOMER' ? booking.userId === req.user.id : Number(booking.venueId) === Number(req.user.venueId))
  if (!allowed) throw Object.assign(new Error('Booking not found'), { status: 404 })
  return booking
}
const id = value => Number.parseInt(value, 10)
const clean = value => value === '' || value === undefined ? undefined : value

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { firstName, lastName, email, password, role = 'CUSTOMER', venueId } = req.body
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: 'First name, last name, email, and password are required' })
  if (!Object.keys({ CUSTOMER: 1, VENUE_STAFF: 1, VENUE_ADMIN: 1, PLATFORM_ADMIN: 1 }).includes(role)) return res.status(400).json({ error: 'Invalid actor role' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  const user = await prisma.user.create({ data: { firstName, lastName, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role, venueId: clean(venueId) ? id(venueId) : undefined } })
  res.status(201).json({ token: signToken(user), user: publicUser(user) })
}))
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email?.toLowerCase() } })
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' })
  res.json({ token: signToken(user), user: publicUser(user) })
}))
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } })
  res.json(publicUser(user))
}))

const venueData = body => ({ name: body.name, city: body.city, address: body.address, operatingSchedule: clean(body.operatingSchedule), cancellationPolicy: clean(body.cancellationPolicy) })
const roomData = body => ({ venueId: id(body.venueId), name: body.name, capacity: id(body.capacity || 1), hourlyRate: Number(body.hourlyRate), amenities: clean(body.amenities), minDuration: id(body.minDuration || 1), maxDuration: id(body.maxDuration || 8) })
const equipmentData = body => ({ venueId: id(body.venueId), name: body.name, hourlyRate: Number(body.hourlyRate), totalUnits: id(body.totalUnits || 0) })
const userData = async body => ({ firstName: body.firstName, lastName: body.lastName, email: body.email?.toLowerCase(), role: body.role, venueId: clean(body.venueId) ? id(body.venueId) : null, ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 12) } : {}) })

const include = { venue: { select: { id: true, name: true } } }
app.get('/api/venues', auth, asyncRoute(async (req, res) => {
  const where = req.user.role === 'PLATFORM_ADMIN' || req.user.role === 'CUSTOMER' ? {} : { id: req.user.venueId ?? -1 }
  res.json(await prisma.venue.findMany({ where, include: { _count: { select: { rooms: true, equipment: true } } }, orderBy: { createdAt: 'desc' }}))
}))
app.get('/api/venues/:id', auth, asyncRoute(async (req, res) => {
  const venueId = id(req.params.id)
  if (req.user.role !== 'PLATFORM_ADMIN' && req.user.role !== 'CUSTOMER' && Number(req.user.venueId) !== venueId) throw Object.assign(new Error('Venue not found'), { status: 404 })
  res.json(await prisma.venue.findUniqueOrThrow({ where: { id: venueId }, include: { rooms: true, equipment: true } }))
}))
app.post('/api/venues', auth, allowRoles('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.status(201).json(await prisma.venue.create({ data: venueData(req.body) }))
}))
app.put('/api/venues/:id', auth, allowRoles('VENUE_ADMIN', 'PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  if (req.user.role !== 'PLATFORM_ADMIN' && Number(req.user.venueId) !== id(req.params.id)) throw Object.assign(new Error('Venue not found'), { status: 404 })
  res.json(await prisma.venue.update({ where: { id: id(req.params.id) }, data: venueData(req.body) }))
}))
app.delete('/api/venues/:id', auth, allowRoles('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  await prisma.venue.delete({ where: { id: id(req.params.id) } }); res.status(204).end()
}))

function crudRoutes(path, model, makeData, options = {}) {
  app.get(`/api/${path}`, auth, asyncRoute(async (req, res) => { res.json(await prisma[model].findMany({ where: options.scope ? options.scope(req.user) : {}, include: options.include, orderBy: { createdAt: 'desc' } })) }))
  app.get(`/api/${path}/:id`, auth, asyncRoute(async (req, res) => { if (options.scope) await resourceVenueId(model, req); res.json(await prisma[model].findUniqueOrThrow({ where: { id: id(req.params.id) }, include: options.include })) }))
  app.post(`/api/${path}`, auth, allowRoles(...(options.writeRoles || ['VENUE_STAFF', 'VENUE_ADMIN', 'PLATFORM_ADMIN'])), asyncRoute(async (req, res) => { res.status(201).json(await prisma[model].create({ data: await makeData(req.body), include: options.include })) }))
  app.put(`/api/${path}/:id`, auth, allowRoles(...(options.writeRoles || ['VENUE_STAFF', 'VENUE_ADMIN', 'PLATFORM_ADMIN'])), asyncRoute(async (req, res) => { if (options.scope) await resourceVenueId(model, req); res.json(await prisma[model].update({ where: { id: id(req.params.id) }, data: await makeData(req.body), include: options.include })) }))
  app.delete(`/api/${path}/:id`, auth, allowRoles(...(options.writeRoles || ['VENUE_ADMIN', 'PLATFORM_ADMIN'])), asyncRoute(async (req, res) => { if (options.scope) await resourceVenueId(model, req); await prisma[model].delete({ where: { id: id(req.params.id) } }); res.status(204).end() }))
}
crudRoutes('rooms', 'room', roomData, { include, scope: scopedVenueWhere, writeRoles: ['VENUE_ADMIN', 'PLATFORM_ADMIN'] })
crudRoutes('equipment', 'equipmentType', equipmentData, { include, scope: scopedVenueWhere, writeRoles: ['VENUE_ADMIN', 'PLATFORM_ADMIN'] })
crudRoutes('users', 'user', userData, { include, scope: scopedUserWhere, writeRoles: ['VENUE_ADMIN', 'PLATFORM_ADMIN'] })

const bookingInclude = { user: { select: { id: true, firstName: true, lastName: true, email: true } }, room: true, venue: true, lineItems: { include: { equipmentType: true } }, payments: true, auditEvents: true }
app.get('/api/bookings', auth, asyncRoute(async (req, res) => { const where = req.user.role === 'CUSTOMER' ? { userId: req.user.id } : scopedVenueWhere(req.user); res.json(await prisma.booking.findMany({ where, include: bookingInclude, orderBy: { startTime: 'desc' } })) }))
app.get('/api/bookings/:id', auth, asyncRoute(async (req, res) => { await scopeBooking(req, id(req.params.id)); res.json(await prisma.booking.findUniqueOrThrow({ where: { id: id(req.params.id) }, include: bookingInclude })) }))
app.post('/api/bookings', auth, asyncRoute(async (req, res) => { const input = { ...req.body, userId: req.user.role === 'CUSTOMER' ? req.user.id : req.body.userId }; const booking = await createBooking(prisma, input, req.user.id); res.status(201).json(booking) }))
app.patch('/api/bookings/:id/transition', auth, asyncRoute(async (req, res) => { await scopeBooking(req, id(req.params.id)); const booking = await transitionBooking(prisma, id(req.params.id), req.body.toState, req.user.id, req.body.reason); res.json(booking) }))
app.post('/api/bookings/:id/payment', auth, asyncRoute(async (req, res) => { await scopeBooking(req, id(req.params.id)); res.status(201).json(await submitPayment(prisma, id(req.params.id), req.user.id, req.get('Idempotency-Key') || req.body.idempotencyKey)) }))
app.delete('/api/bookings/:id', auth, asyncRoute(async (req, res) => { await scopeBooking(req, id(req.params.id)); await transitionBooking(prisma, id(req.params.id), 'CANCELLED', req.user.id, 'Cancelled by user'); res.status(204).end() }))
app.post('/api/payments/webhook', asyncRoute(async (req, res) => { res.json(await handlePaymentWebhook(prisma, req.body, null)) }))
app.get('/api/reports/reconciliation', auth, allowRoles('PLATFORM_ADMIN'), asyncRoute(async (req, res) => { res.json(await reconciliationReport(prisma)) }))
app.get('/api/payments', auth, asyncRoute(async (req, res) => { res.json(await prisma.payment.findMany({ include: { booking: true }, orderBy: { createdAt: 'desc' } })) }))
app.get('/api/payments/:id', auth, asyncRoute(async (req, res) => { res.json(await prisma.payment.findUniqueOrThrow({ where: { id: id(req.params.id) }, include: { booking: true } })) }))
app.get('/api/audit-events', auth, asyncRoute(async (req, res) => { res.json(await prisma.auditEvent.findMany({ include: { actor: true, booking: true }, orderBy: { timestamp: 'desc' } })) }))
app.get('/api/audit-events/:id', auth, asyncRoute(async (req, res) => { res.json(await prisma.auditEvent.findUniqueOrThrow({ where: { id: id(req.params.id) }, include: { actor: true, booking: true } })) }))

app.use((error, req, res, next) => {
  if (!error.status || error.status >= 500) {
    // Don't log expected concurrency rejections as errors
    if (!['P2034', 'P2024', 'P2028'].includes(error.code)) console.error(error)
  }
  // P2034 = write conflict / serialization failure → 409 Conflict (retry)
  // P2024 = connection pool timeout → 503 Service Unavailable
  // P2028 = transaction timeout → 503 Service Unavailable
  // P2002 = unique constraint violation → 409 Conflict
  const status = error.status
    || (error.code === 'P2034' ? 409
      : error.code === 'P2002' ? 409
      : error.code === 'P2024' ? 503
      : error.code === 'P2028' ? 503
      : 500)
  const message = error.code === 'P2034' ? 'Booking conflict — please retry'
    : error.code === 'P2002' ? 'A record with that unique value already exists'
    : error.code === 'P2024' ? 'Server busy — please retry'
    : error.code === 'P2028' ? 'Server busy — please retry'
    : error.message || 'Server error'
  res.status(status).json({ error: message })
})
export const setPrismaClient = client => { prisma = client }
export { app }
if (process.env.NODE_ENV !== 'test') app.listen(port, '0.0.0.0', () => console.log(`Atrium API running on port ${port}`))
