import mongoose from 'mongoose';
import { CHAT_RETENTION_DAYS } from '../utils/constants.js';

/**
 * Ephemeral chat. On settlement every message in the room is soft-deleted:
 * hidden from both users immediately, but retained for CHAT_RETENTION_DAYS so
 * an admin can resolve a dispute. A TTL index then purges it for good —
 * MongoDB does the deleting, not a cron job we might forget to run.
 */
const messageSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: [800, 'Message is too long'],
    },
    kind: {
      type: String,
      enum: ['text', 'system', 'location'],
      default: 'text',
    },
    readAt: Date,

    // ---- Soft delete ----
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    /**
     * Set at settlement. MongoDB removes the document when this date passes.
     * Null means "keep" — TTL indexes ignore documents without the field.
     */
    purgeAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ task: 1, createdAt: 1 });
// TTL: Mongo deletes the doc as soon as purgeAt is in the past.
messageSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

messageSchema.statics.softDeleteRoom = async function (taskId) {
  const purgeAt = new Date(Date.now() + CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return this.updateMany(
    { task: taskId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), purgeAt } }
  );
};

const Message = mongoose.model('Message', messageSchema);
export default Message;
