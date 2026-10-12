import express from 'express';
import { createReview, getTaskReviews } from '../controllers/reviewController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/:taskId', protect, createReview);
router.get('/task/:taskId', protect, getTaskReviews);

export default router;
