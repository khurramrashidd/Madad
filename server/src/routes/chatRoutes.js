import express from 'express';
import { getMessages, sendMessage, getRooms } from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.get('/', protect, getRooms);
router.get('/:taskId', protect, getMessages);
router.post('/:taskId', protect, messageLimiter, sendMessage);

export default router;
