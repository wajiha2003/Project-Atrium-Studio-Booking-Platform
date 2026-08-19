/**
 * payment module - public surface.
 *
 * Paygate client, charge/refund orchestration, webhook processor, reconciliation service.
 *
 * Re-export only what other modules are allowed to import (routes, and
 * any DTO/types other modules legitimately need). Never reach into
 * another module's controllers/repositories directly - go through here.
 */
export {};
