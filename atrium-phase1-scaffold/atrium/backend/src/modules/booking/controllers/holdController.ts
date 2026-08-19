import { Request, Response } from 'express';
import * as repo from '../repositories/holdRepository';

export async function createHold(req: Request, res: Response) {
  const { userId, roomId, start, end, equipment } = req.body;
  try {
    const booking = await repo.createHold({ userId, roomId, start, end, equipment });
    return res.status(201).json(booking);
  } catch (err: any) {
    if (err && err.code === 'ROOM_CONFLICT') {
      return res.status(409).json({ error: 'Room not available for the requested interval' });
    }
    if (err && err.code === 'EQUIPMENT_CONFLICT') {
      return res.status(409).json({ error: 'Equipment capacity exceeded for the requested interval' });
    }
    console.error('createHold error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

export default { createHold };
