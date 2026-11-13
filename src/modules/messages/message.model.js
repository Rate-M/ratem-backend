const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientMessageId: { type: String, required: true, maxlength: 64 },
  text: { type: String, required: true, maxlength: 2000 },
}, { timestamps: { createdAt: true, updatedAt: false } });

messageSchema.index({ match: 1, sender: 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ match: 1, _id: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ recipient: 1 });

module.exports = mongoose.model('Message', messageSchema);
