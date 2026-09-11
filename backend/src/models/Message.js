import mongoose from 'mongoose';

/**
 * Chat message inside a negotiation thread (Offer).
 * type "offer" messages point at a structured round on the Offer document,
 * so the chat UI can render them as offer cards instead of plain bubbles.
 */
const messageSchema = new mongoose.Schema(
  {
    offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for system messages
    type: { type: String, enum: ['text', 'offer', 'system'], default: 'text' },
    text: { type: String, trim: true, maxlength: 2000 },
    roundId: { type: mongoose.Schema.Types.ObjectId },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ offer: 1, createdAt: 1 });
messageSchema.set('toJSON', { versionKey: false });

export const Message = mongoose.model('Message', messageSchema);
