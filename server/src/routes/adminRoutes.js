import express from 'express';
import {
  getStats, listUsers, adjustTrust, toggleRestriction, listTasks,
  listDisputes, getDisputeEvidence, resolveDispute,
} from '../controllers/adminController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.post('/users/:id/trust', adjustTrust);
router.post('/users/:id/restrict', toggleRestriction);
router.get('/tasks', listTasks);
router.get('/disputes', listDisputes);
router.get('/disputes/:id/evidence', getDisputeEvidence);
router.post('/disputes/:id/resolve', resolveDispute);

export default router;
