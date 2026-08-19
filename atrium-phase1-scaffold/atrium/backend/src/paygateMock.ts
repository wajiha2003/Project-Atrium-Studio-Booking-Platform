import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

type Charge = { charge_id: string; reference: string; amount_minor: number; status: string };

const store = new Map<string, Charge>();

function hmac(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const CHAOS = (process.env.PAYGATE_CHAOS ?? 'off') === 'on';
const SECRET = process.env.PAYGATE_SECRET ?? 'change-me-webhook-hmac-secret';
const CALLBACK = process.env.PAYGATE_CALLBACK_URL ?? 'http://localhost:4000/webhooks/paygate';

function maybe(pct: number) {
  return Math.random() < pct;
}

app.post('/paygate/charges', (req, res) => {
  const idempotency = req.header('Idempotency-Key') ?? req.body.idempotency ?? '';
  const { amount_minor, reference } = req.body;

  // transient failure
  if (CHAOS && maybe(0.10)) {
    return res.status(500).json({ error: 'transient' });
  }

  // idempotency: if charge exists for idempotency key, return same
  if (store.has(idempotency)) {
    const c = store.get(idempotency)!;
    return res.status(202).json({ charge_id: c.charge_id, status: 'processing' });
  }

  const charge_id = `ch_${crypto.randomBytes(8).toString('hex')}`;
  const charge: Charge = { charge_id, reference, amount_minor, status: 'processing' };
  store.set(idempotency || charge_id, charge);

  // race on response: sometimes send webhook before responding
  const deliver = async () => {
    const body = JSON.stringify({ charge_id, reference, event: 'charge.succeeded', amount_minor, occurred_at: new Date().toISOString() });
    const sig = hmac(body, SECRET);

    // duplicate delivery
    const deliveries = CHAOS && maybe(0.30) ? 2 : 1;

    for (let i = 0; i < deliveries; i++) {
      const delay = (CHAOS && maybe(0.05)) ? (60000 + Math.floor(Math.random() * 30000)) : (CHAOS && maybe(0.25) ? -1 : 0);
      // out of order / race: negative delay indicates send immediately even before response
      if (delay === -1) {
        // send immediately (race)
        await sendWebhook(body, sig, i);
      } else if (delay > 0) {
        setTimeout(() => sendWebhook(body, sig, i), delay);
      } else {
        setTimeout(() => sendWebhook(body, sig, i), 100);
      }
    }
  };

  if (CHAOS && maybe(0.25)) {
    // send webhook before response
    deliver();
    return res.status(202).json({ charge_id, status: 'processing' });
  }

  // normal flow: respond and then deliver
  res.status(202).json({ charge_id, status: 'processing' });
  setTimeout(deliver, 50);
});

async function sendWebhook(body: string, sig: string, attempt: number) {
  const badSig = CHAOS && maybe(0.02);
  const headers: any = { 'X-Paygate-Signature': badSig ? 'bad-sig' : sig, 'X-Paygate-Delivery': crypto.randomBytes(8).toString('hex') };
  try {
    await fetch(CALLBACK, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  } catch (e) {
    // ignore
  }
}

app.post('/paygate/refunds', (req, res) => {
  // simple ack
  res.status(202).json({ refund_id: `rf_${crypto.randomBytes(6).toString('hex')}`, status: 'processing' });
});

export function startPaygateMock(port = 4001) {
  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[paygate-mock] listening on ${port}`);
      resolve();
    });
  });
}

if (require.main === module) {
  startPaygateMock().catch(() => process.exit(1));
}
