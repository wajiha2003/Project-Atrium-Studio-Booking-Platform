import fetch from 'node-fetch';
import { buildApp } from '../../../app';
import prisma from '../../../database/prismaClient';

const ports = [5000, 5001, 5002];

function startServers() {
  const servers = ports.map((port, i) => {
    const app = buildApp();
    return app.listen(port, () => console.log(`test-api-${i} listening ${port}`));
  });
  return servers;
}

function stopServers(servers: any[]) {
  servers.forEach((s) => s.close());
}

function lbRequest(urlPath: string, bodies: any[], roundRobinIndex: { idx: number }) {
  const port = ports[roundRobinIndex.idx % ports.length];
  roundRobinIndex.idx += 1;
  return fetch(`http://localhost:${port}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodies)
  });
}

describe('Concurrency proof for holds', () => {
  let servers: any[] = [];

  beforeAll(async () => {
    // ensure demo data exists
    await prisma.venue.upsert({ where: { id: 'venue-demo' }, update: {}, create: { id: 'venue-demo', name: 'Demo Venue' } });
    await prisma.room.upsert({ where: { id: 'room-1' }, update: {}, create: { id: 'room-1', venueId: 'venue-demo', name: 'Studio A', capacity: 4 } });
    await prisma.equipmentType.upsert({ where: { id: 'camera-1' }, update: {}, create: { id: 'camera-1', venueId: 'venue-demo', name: 'Camera', totalUnits: 3 } });
    await prisma.user.upsert({ where: { id: 'user-demo' }, update: {}, create: { id: 'user-demo', email: 'demo@example.com', name: 'Demo User', role: 'CUSTOMER' } });

    servers = startServers();
  }, 20000);

  afterAll(async () => {
    stopServers(servers);
    await prisma.$disconnect();
  });

  test('200 concurrent requests against same room slot results in 1 success', async () => {
    const requests = 200;
    const rr = { idx: 0 };
    const tasks = [] as Promise<any>[];
    for (let i = 0; i < requests; i++) {
      const body = { userId: `user-${i}`, roomId: 'room-1', start: '2026-08-20T10:00:00.000Z', end: '2026-08-20T11:00:00.000Z', equipment: [] };
      tasks.push(lbRequest('/bookings/holds', body, rr).then((r) => ({ status: r.status, body: r.text() })));
    }

    const results = await Promise.all(tasks);
    const success = results.filter((r) => r.status === 201).length;
    const conflicts = results.filter((r) => r.status === 409).length;

    console.log('results', { success, conflicts });

    expect(success).toBe(1);
    expect(conflicts).toBe(requests - 1);
  }, 60000);
});
