/**
 * booking module - public surface.
 *
 * Booking lifecycle: BookingStateMachine, hold creation, room + equipment concurrency-safe reservation.
 *
 * Re-export only what other modules are allowed to import (routes, and
 * any DTO/types other modules legitimately need). Never reach into
 * another module's controllers/repositories directly - go through here.
 */
export {};
