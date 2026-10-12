import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Which hat the reviewer was wearing. */
    role: { type: String, enum: ['wisher', 'volunteer'], required: true },
    rating: {
      type: Number,
      required: true,
      min: [1, 'Rating must be 1-5'],
      max: [5, 'Rating must be 1-5'],
    },
    comment: { type: String, trim: true, maxlength: 300, default: '' },
    tags: [{ type: String, enum: ['punctual', 'polite', 'careful', 'fast', 'clear', 'late', 'rude', 'careless'] }],
  },
  { timestamps: true }
);

// One review per reviewer per task — no rating-bombing.
reviewSchema.index({ task: 1, reviewer: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
