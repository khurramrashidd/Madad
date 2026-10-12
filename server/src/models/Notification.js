import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'task_claimed',
        'task_delivered',
        'payment_requested',
        'payment_marked',
        'payment_confirmed',
        'task_settled',
        'task_expired',
        'new_message',
        'review_received',
        'trust_changed',
        'restricted',
        'dispute_update',
        'nearby_task',
        'sos',
        'trip_shared',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    link: String,
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
// Auto-clean after 30 days so the collection can't grow forever.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
