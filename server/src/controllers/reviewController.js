import Review from '../models/Review.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { applyTrustEvent } from '../services/trustScore.js';
import { notify } from '../services/notify.js';
import { TASK_STATUS } from '../utils/constants.js';

/**
 * POST /api/reviews/:taskId
 * Reviews are only possible on settled tasks, only by the two parties, and
 * only once each. That gate is what stops the rating system being gameable.
 */
export const createReview = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw ApiError.notFound('Task not found');
  if (task.status !== TASK_STATUS.SETTLED) {
    throw ApiError.badRequest('You can only review a settled task');
  }

  const isWisher = task.wisher.equals(req.user._id);
  const isVolunteer = task.volunteer?.equals(req.user._id);
  if (!isWisher && !isVolunteer) throw ApiError.forbidden('Not your task');

  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.badRequest('Rating must be a whole number from 1 to 5');
  }

  if (await Review.exists({ task: task._id, reviewer: req.user._id })) {
    throw ApiError.conflict('You already reviewed this task');
  }

  const subjectId = isWisher ? task.volunteer : task.wisher;

  const review = await Review.create({
    task: task._id,
    reviewer: req.user._id,
    subject: subjectId,
    role: isWisher ? 'wisher' : 'volunteer',
    rating,
    comment: String(req.body.comment || '').slice(0, 300),
    tags: Array.isArray(req.body.tags) ? req.body.tags.slice(0, 4) : [],
  });

  await User.updateOne(
    { _id: subjectId },
    { $inc: { 'stats.ratingSum': rating, 'stats.ratingCount': 1 } }
  );

  // Ratings feed straight back into trust — 4-5 rewards, 1-2 penalises, 3 is neutral.
  if (rating >= 4) {
    await applyTrustEvent(subjectId, 'GOOD_REVIEW', { task: task._id, io: global.__io });
  } else if (rating <= 2) {
    await applyTrustEvent(subjectId, 'BAD_REVIEW', { task: task._id, io: global.__io });
  }

  await notify(subjectId, {
    type: 'review_received',
    title: `${req.user.name} rated you ${rating}★`,
    body: review.comment || 'Tap to see your updated profile.',
    task: task._id,
    link: `/profile/${subjectId}`,
  }, global.__io);

  res.status(201).json({ success: true, review });
});

/** GET /api/reviews/task/:taskId — what each side already said. */
export const getTaskReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ task: req.params.taskId })
    .populate('reviewer', 'name avatarColor')
    .populate('subject', 'name');

  res.json({
    success: true,
    reviews,
    myReview: reviews.find((r) => String(r.reviewer._id) === String(req.user._id)) || null,
  });
});

export default { createReview, getTaskReviews };
