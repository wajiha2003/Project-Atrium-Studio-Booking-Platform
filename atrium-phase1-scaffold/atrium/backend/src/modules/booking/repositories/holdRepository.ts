import prisma from '../../../database/prismaClient';

type EquipmentLine = { equipmentTypeId: string; quantity: number };

export async function createHold(opts: {
  userId?: string;
  roomId: string;
  start: string | Date;
  end: string | Date;
  equipment?: EquipmentLine[];
}) {
  const { userId, roomId, start, end, equipment = [] } = opts;
  const startDt = new Date(start);
  const endDt = new Date(end);

  return await prisma.$transaction(async (tx) => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');

    // Acquire an advisory lock scoped to the room id to serialize competing
    // holds for the same room across instances. Only available on Postgres.
    if (isPostgres) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(hashCode(roomId))})`;
    }

    // Check for overlapping bookings on the room in HELD/PENDING_PAYMENT/CONFIRMED
    const conflicts = await tx.booking.findFirst({
      where: {
        roomId,
        status: { in: ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'] },
        OR: [
          { start: { lt: endDt }, end: { gt: startDt } }
        ]
      }
    });

    if (conflicts) {
      const err: any = new Error('room conflict');
      err.code = 'ROOM_CONFLICT';
      throw err;
    }

    // For each equipment line item, acquire advisory lock per equipmentType and
    // check overlapping quantities.
    for (const line of equipment) {
      if (isPostgres) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(hashCode(line.equipmentTypeId))})`;
      }

      const sumResult: any = await tx.$queryRaw`
        SELECT COALESCE(SUM("BookingLineItem"."quantity"),0) as sum
        FROM "BookingLineItem"
        JOIN "Booking" ON "Booking"."id" = "BookingLineItem"."bookingId"
        WHERE "BookingLineItem"."equipmentTypeId" = ${line.equipmentTypeId}
          AND "Booking"."status" IN ('HELD','PENDING_PAYMENT','CONFIRMED')
          AND NOT ("Booking"."end" <= ${startDt} OR "Booking"."start" >= ${endDt})
      `;

      const existing = sumResult && sumResult[0] ? Number(sumResult[0].sum) : 0;
      const equipmentType = await tx.equipmentType.findUnique({ where: { id: line.equipmentTypeId } });
      const capacity = equipmentType?.totalUnits ?? 0;
      if (existing + line.quantity > capacity) {
        const err: any = new Error('equipment conflict');
        err.code = 'EQUIPMENT_CONFLICT';
        throw err;
      }
    }

    // Create booking in HELD state with expiry
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000); // 8 minutes TTL

    const booking = await tx.booking.create({
      data: {
        userId,
        roomId,
        start: startDt,
        end: endDt,
        status: 'HELD',
        expiresAt,
        lineItems: {
          create: equipment.map((e) => ({ equipmentTypeId: e.equipmentTypeId, quantity: e.quantity }))
        }
      },
      include: { lineItems: true }
    });

    // Write an audit event
    await tx.auditEvent.create({ data: { actorId: userId, action: 'CREATE_HOLD', details: `booking:${booking.id}` } });

    return booking;
  });
}

function hashCode(s: string) {
  // Simple deterministic hash to map string ids to a signed 64-bit integer
  let h = 0n;
  for (let i = 0; i < s.length; i++) {
    h = h * 31n + BigInt(s.charCodeAt(i));
  }
  return h & ((1n << 63n) - 1n);
}
