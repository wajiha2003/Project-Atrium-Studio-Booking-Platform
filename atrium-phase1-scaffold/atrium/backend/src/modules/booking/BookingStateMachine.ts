/**
 * BookingStateMachine
 *
 * PHASE 4 STUB. Real implementation comes after ARCHITECTURE.md is
 * reviewed. This file exists now so the contract is fixed early:
 *
 *   - Centralized: this is the ONLY place a booking's `state` column
 *     is written. No controller/service may run `UPDATE bookings SET state=...`
 *     directly - grep for that in review, it's an instant fail per the brief.
 *   - Every transition method validates DRAFT -> HELD -> PENDING_PAYMENT ->
 *     CONFIRMED -> COMPLETED, and the failure edges EXPIRED / FAILED /
 *     CANCELLED -> REFUNDED, against a fixed transition table.
 *   - Illegal transitions throw IllegalTransitionError, which the error
 *     middleware converts to a clean 409 (never a 500).
 *   - Every successful transition writes exactly one AuditEvent
 *     (actorId, fromState, toState, reason, timestamp) in the SAME
 *     database transaction as the state write - never a separate call.
 *
 * States: DRAFT, HELD, PENDING_PAYMENT, CONFIRMED, COMPLETED,
 *         EXPIRED, FAILED, CANCELLED, REFUNDED
 */

export type BookingState =
  | 'DRAFT'
  | 'HELD'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export class IllegalTransitionError extends Error {
  constructor(public readonly from: BookingState, public readonly to: BookingState) {
    super(`Illegal booking transition: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

// TODO(Phase 4): finalize against the diagram in ARCHITECTURE.md before coding transitions.
export const ALLOWED_TRANSITIONS: Record<BookingState, BookingState[]> = {
  DRAFT: ['HELD'],
  HELD: ['PENDING_PAYMENT', 'EXPIRED'],
  PENDING_PAYMENT: ['CONFIRMED', 'FAILED', 'EXPIRED'], // EXPIRED here covers INV-4: hold TTL elapsed while payment in flight
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  EXPIRED: [],
  FAILED: [],
  CANCELLED: ['REFUNDED'],
  REFUNDED: []
};

// TODO(Phase 4): implement class BookingStateMachine with explicit methods,
// e.g. hold(), submitPayment(), confirm(), expire(), fail(), cancel(), refund(),
// each wrapping prisma.$transaction([...]) with the AuditEvent write.
export {};
