/**
 * Venue-isolation + role-based authorization.
 *
 * PHASE 7 STUB. Must enforce INV-6: a VENUE_ADMIN/VENUE_STAFF scoped to
 * Venue A gets 403/404 (never data) for any resource belonging to Venue B,
 * including when a syntactically valid UUID for Venue B is supplied
 * directly. This check happens in the DB query layer (repository), not
 * just here - see repositories/*.ts TODOs.
 */
export {};
