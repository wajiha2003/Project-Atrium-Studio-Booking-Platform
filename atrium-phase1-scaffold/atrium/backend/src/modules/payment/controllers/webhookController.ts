import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../../../database/prismaClient';

export async function handlePaygateWebhook(req: Request, res: Response) {
  const secret = process.env.PAYGATE_SECRET ?? 'change-me-webhook-hmac-secret';
  const sig = req.header('X-Paygate-Signature') ?? '';
  const raw = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

  if (sig !== expected) {
    // Bad signature
    return res.status(401).json({ error: 'bad_signature' });
  }

  const { charge_id, reference, event, amount_minor, occurred_at } = req.body;

  // Idempotency: check for existing payment record
  const existing = await prisma.payment.findFirst({ where: { providerId: charge_id } });
  if (existing) {
    return res.status(200).json({ ok: true });
  }

  // Create or update payment and optionally confirm booking
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({ data: { bookingId: reference, providerId: charge_id, amount: amount_minor, currency: 'PKR', status: 'succeeded' } });

    // Only confirm if booking still HELD and not expired
    const booking = await tx.booking.findUnique({ where: { id: reference } });
    if (booking && booking.status === 'HELD' && (!booking.expiresAt || booking.expiresAt.getTime() > Date.now())) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
      await tx.auditEvent.create({ data: { actorId: null, action: 'PAYMENT_CONFIRMED', details: `charge:${charge_id} booking:${booking.id}` } });
    } else {
      // Booking expired or missing: create refund (not implemented here)
    }
  });

  return res.status(200).json({ ok: true });
}

export default { handlePaygateWebhook };
