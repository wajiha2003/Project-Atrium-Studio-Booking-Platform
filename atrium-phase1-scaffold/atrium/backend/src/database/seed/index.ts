import prisma from '../../database/prismaClient';

async function main() {
  console.log('Seeding demo data...');

  const venue = await prisma.venue.upsert({
    where: { id: 'venue-demo' },
    update: {},
    create: { id: 'venue-demo', name: 'Demo Venue', city: 'Karachi' }
  });

  const room = await prisma.room.upsert({
    where: { id: 'room-1' },
    update: {},
    create: { id: 'room-1', venueId: venue.id, name: 'Studio A', capacity: 4 }
  });

  const equipment = await prisma.equipmentType.upsert({
    where: { id: 'camera-1' },
    update: {},
    create: { id: 'camera-1', venueId: venue.id, name: 'Camera', totalUnits: 3 }
  });

  const user = await prisma.user.upsert({
    where: { id: 'user-demo' },
    update: {},
    create: { id: 'user-demo', email: 'demo@example.com', name: 'Demo User', role: 'CUSTOMER' }
  });

  console.log({ venue: venue.id, room: room.id, equipment: equipment.id, user: user.id });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
