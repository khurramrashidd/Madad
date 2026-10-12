import express from 'express';
import { ipLocation, reverse, search } from '../controllers/geoController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Open to signed-out users: the location chain runs before and during the
 * login screen, and the register screen needs a position too.
 */
router.get('/ip', optionalAuth, ipLocation);
router.get('/reverse', optionalAuth, reverse);
router.get('/search', optionalAuth, search);

export default router;
