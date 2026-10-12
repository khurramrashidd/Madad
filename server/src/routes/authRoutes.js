import express from 'express';
import {
  register, login, requestOtp, verifyOtp, getMe, logout, getDemoAccounts, demoRecentre,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/otp/request', authLimiter, requestOtp);
router.post('/otp/verify', authLimiter, verifyOtp);
// Development only — the handler 404s in production.
router.get('/demo-accounts', getDemoAccounts);
router.post('/demo-recentre', protect, demoRecentre);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export default router;
