import express from 'express';
import {
  createTask, getFeed, getMyTasks, getTask, claimTask, verifyHandshake,
  getPaymentDetails, markPaid, confirmReceipt, boostBounty, cancelTask,
  reportNonPayment,
} from '../controllers/taskController.js';
import { raiseDispute } from '../controllers/adminController.js';
import { protect, optionalAuth, requireGoodStanding } from '../middleware/auth.js';
import { createTaskLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Browsing works signed-out so the app has something to show on first open.
router.get('/', optionalAuth, getFeed);
router.get('/mine', protect, getMyTasks);
router.get('/:id', optionalAuth, getTask);

router.post('/', protect, requireGoodStanding, createTaskLimiter, createTask);
router.post('/:id/claim', protect, requireGoodStanding, claimTask);
router.post('/:id/handshake', protect, verifyHandshake);
router.get('/:id/payment', protect, getPaymentDetails);
router.post('/:id/paid', protect, markPaid);
router.post('/:id/confirm', protect, confirmReceipt);
router.post('/:id/boost', protect, boostBounty);
router.post('/:id/cancel', protect, cancelTask);
router.post('/:id/no-payment', protect, reportNonPayment);
router.post('/:id/dispute', protect, (req, res, next) => {
  req.params.taskId = req.params.id;
  raiseDispute(req, res, next);
});

export default router;
