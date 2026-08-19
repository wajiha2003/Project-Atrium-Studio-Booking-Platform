/**
 * Express app assembly.
 *
 * Kept separate from server.ts so Supertest can import `app` directly
 * without binding a real port (needed for integration + concurrency tests).
 *
 * PHASE 1 STUB: wiring only. Route modules are still empty placeholders and
 * will be filled in during Phase 5 (booking), Phase 6 (payment) and
 * Phase 7 (auth/authorization).
 */
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// import authRoutes from '@modules/auth/routes';
// import venueRoutes from '@modules/venue/routes';
// import bookingRoutes from '@modules/booking/routes';
// import equipmentRoutes from '@modules/equipment/routes';
// import paymentRoutes from '@modules/payment/routes';
// import { requestContext } from '@middleware/requestContext';
// import { errorHandler } from '@middleware/errorHandler';

export function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // TODO(Phase 5+): app.use(requestContext) - attaches correlation ID that
  // must survive into the Paygate webhook path (see brief section 08).

  app.get('/health', (_req: Request, res: Response) => {
    // TODO: this must actually check DB connectivity before returning 200,
    // not just prove the process is alive (brief section 10 deliverables).
    res.status(200).json({ status: 'ok', service: 'atrium-api' });
  });

  // TODO(Phase 7): app.use('/auth', authRoutes);
  // TODO(Phase 5): app.use('/venues', venueRoutes);
  // Booking routes (Phase 1 hold implementation)
  // Note: we mount the minimal bookings surface early to exercise concurrency logic.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bookingRoutes = require('./modules/booking/routes').default;
  app.use('/bookings', bookingRoutes);
  // TODO(Phase 5): app.use('/equipment', equipmentRoutes);
  // TODO(Phase 6): app.use('/payments', paymentRoutes);
  // TODO(Phase 6): app.use('/webhooks/paygate', paygateWebhookRoutes);

  // TODO(Phase 5+): app.use(errorHandler) - must be last, converts thrown
  // domain errors (e.g. IllegalTransitionError) into clean 409s per brief.

  return app;
}

export default buildApp;
