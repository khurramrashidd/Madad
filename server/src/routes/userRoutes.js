import express from 'express';
import {
  updateMe, updateLocation, getProfile, getTrustHistory, getLeaderboard,
  blockUser, getNotifications, markNotificationsRead, savePushSubscription,
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Static paths first — otherwise "/leaderboard" is read as an :id.
router.get('/leaderboard', getLeaderboard);
router.patch('/me', protect, updateMe);
router.put('/me/location', protect, updateLocation);
router.get('/me/trust', protect, getTrustHistory);
router.get('/me/notifications', protect, getNotifications);
router.post('/me/notifications/read', protect, markNotificationsRead);
router.post('/me/push', protect, savePushSubscription);
router.post('/:id/block', protect, blockUser);
router.get('/:id', getProfile);

export default router;
