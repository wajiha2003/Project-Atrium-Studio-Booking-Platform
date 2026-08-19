import { Router } from 'express';
import holdController from '../controllers/holdController';

const router = Router();

router.post('/holds', holdController.createHold);

export default router;
