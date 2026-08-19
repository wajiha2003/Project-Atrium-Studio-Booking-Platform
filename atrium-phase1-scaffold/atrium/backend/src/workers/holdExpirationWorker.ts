/**
 * Background worker: finds HELD bookings past holdExpiresAt and transitions
 * them to EXPIRED via BookingStateMachine, releasing room + equipment
 * inventory. Also the mechanism behind INV-4 (expired hold + late payment
 * success -> auto refund). PHASE 5 STUB.
 */
export {};
