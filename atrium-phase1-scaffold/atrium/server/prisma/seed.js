import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const catalog = [
  {
    name: 'Atrium Downtown',
    city: 'New York',
    address: '125 Mercer Street',
    operatingSchedule: 'Mon-Fri 08:00-22:00; Sat-Sun 09:00-20:00',
    cancellationPolicy: 'Free cancellation up to 24 hours before the booking.',
    rooms: [
      { name: 'Podcast Suite A', capacity: 4, hourlyRate: 90, amenities: 'Acoustic treatment, 4 microphones, monitoring desk', minDuration: 1, maxDuration: 6 },
      { name: 'Cyclorama Studio', capacity: 12, hourlyRate: 160, amenities: 'White cyc wall, lighting grid, changing area', minDuration: 2, maxDuration: 10 },
      { name: 'Recording Room 02', capacity: 6, hourlyRate: 120, amenities: 'Isolation booth, piano, 8-channel interface', minDuration: 1, maxDuration: 8 }
    ],
    equipment: [
      { name: 'Cinema Camera', hourlyRate: 45, totalUnits: 4 },
      { name: 'Wireless Microphone Kit', hourlyRate: 18, totalUnits: 10 },
      { name: 'LED Light Panel', hourlyRate: 15, totalUnits: 8 }
    ]
  },
  {
    name: 'Atrium Brooklyn',
    city: 'Brooklyn',
    address: '48 Wythe Avenue',
    operatingSchedule: 'Mon-Sun 07:00-23:00',
    cancellationPolicy: 'Free cancellation up to 12 hours before the booking.',
    rooms: [
      { name: 'Photo Loft', capacity: 10, hourlyRate: 110, amenities: 'North light, blackout curtains, prop wall', minDuration: 2, maxDuration: 8 },
      { name: 'Edit Suite', capacity: 3, hourlyRate: 65, amenities: 'Color-calibrated display, speakers, fast storage', minDuration: 1, maxDuration: 12 }
    ],
    equipment: [
      { name: 'Full-Frame Camera', hourlyRate: 35, totalUnits: 3 },
      { name: 'Tripod', hourlyRate: 8, totalUnits: 8 },
      { name: 'Softbox Kit', hourlyRate: 12, totalUnits: 6 }
    ]
  },
  {
    name: 'Atrium Queens',
    city: 'Queens',
    address: '31 Jackson Avenue',
    operatingSchedule: 'Mon-Fri 09:00-21:00; Sat 10:00-18:00',
    cancellationPolicy: 'Free cancellation up to 48 hours before the booking.',
    rooms: [
      { name: 'Rehearsal Hall', capacity: 20, hourlyRate: 75, amenities: 'Sprung floor, mirrors, Bluetooth audio', minDuration: 1, maxDuration: 8 },
      { name: 'Workshop Room', capacity: 14, hourlyRate: 85, amenities: 'Workbench, sink, storage lockers', minDuration: 2, maxDuration: 8 }
    ],
    equipment: [
      { name: 'Portable PA System', hourlyRate: 22, totalUnits: 3 },
      { name: 'Projector', hourlyRate: 20, totalUnits: 2 },
      { name: 'Folding Worktable', hourlyRate: 5, totalUnits: 12 }
    ]
  }
]

async function findOrCreateVenue(data) {
  const existing = await prisma.venue.findFirst({ where: { name: data.name, city: data.city } })
  const venue = existing
    ? await prisma.venue.update({ where: { id: existing.id }, data: { address: data.address, operatingSchedule: data.operatingSchedule, cancellationPolicy: data.cancellationPolicy } })
    : await prisma.venue.create({ data: { name: data.name, city: data.city, address: data.address, operatingSchedule: data.operatingSchedule, cancellationPolicy: data.cancellationPolicy } })

  for (const room of data.rooms) {
    const current = await prisma.room.findFirst({ where: { venueId: venue.id, name: room.name } })
    if (current) await prisma.room.update({ where: { id: current.id }, data: room })
    else await prisma.room.create({ data: { ...room, venueId: venue.id } })
  }

  for (const equipment of data.equipment) {
    const current = await prisma.equipmentType.findFirst({ where: { venueId: venue.id, name: equipment.name } })
    if (current) await prisma.equipmentType.update({ where: { id: current.id }, data: equipment })
    else await prisma.equipmentType.create({ data: { ...equipment, venueId: venue.id } })
  }

  return venue
}

try {
  for (const venue of catalog) {
    const created = await findOrCreateVenue(venue)
    console.log(`Seeded ${created.name}: ${venue.rooms.length} rooms, ${venue.equipment.length} equipment types`)
  }
} finally {
  await prisma.$disconnect()
}
