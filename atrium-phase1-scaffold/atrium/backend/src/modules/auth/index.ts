/**
 * auth module - public surface.
 *
 * Login, token issuance/refresh, role + venue-scope resolution used by authorization middleware.
 *
 * Re-export only what other modules are allowed to import (routes, and
 * any DTO/types other modules legitimately need). Never reach into
 * another module's controllers/repositories directly - go through here.
 */
export {};
