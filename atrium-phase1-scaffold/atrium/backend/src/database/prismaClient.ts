/**
 * Single shared Prisma Client instance.
 *
 * Every module MUST import the client from here, never instantiate its own
 * PrismaClient. This matters for connection pooling and, later, for the
 * transaction/locking strategy in the booking module (Phase 4/5), which
 * relies on explicit `prisma.$transaction` blocks with correct isolation
 * levels and row locks.
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}

export default prisma;
