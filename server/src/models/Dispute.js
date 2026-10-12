import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['not_paid', 'not_done', 'no_show', 'wrong_amount', 'abusive', 'other'],
      required: true,
    },
    detail: { type: String, trim: true, maxlength: 600, default: '' },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'rejected'],
      default: 'open',
      index: true,
    },
    resolution: {
      verdict: { type: String, enum: ['upheld', 'dismissed', 'split', null], default: null },
      note: { type: String, maxlength: 600 },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: Date,
    },
  },
  { timestamps: true }
);

const Dispute = mongoose.model('Dispute', disputeSchema);
export default Dispute;
