import express from 'express';
import {
  startTrip, reportPosition, endTrip, viewTrip, raiseSos,
} from '../controllers/safetyController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * The watcher route is deliberately public — the share token is the
 * credential, so that someone's mother can open the link from WhatsApp
 * without being asked to create an account. Everything that *changes* a trip
 * still requires the traveller's own token.
 */
router.get('/trip/:token', viewTrip);

router.post('/trip/:taskId', protect, startTrip);
router.put('/trip/:token/position', protect, reportPosition);
router.post('/trip/:token/end', protect, endTrip);
router.post('/sos/:taskId', protect, raiseSos);

export default router;
