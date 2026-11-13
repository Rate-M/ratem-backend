const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  // El match es también el aviso persistente de ambos: no hay escrituras separadas.
  readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
}, { timestamps: true });

matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ userA: 1, status: 1, _id: -1 });
matchSchema.index({ userB: 1, status: 1, _id: -1 });

module.exports = mongoose.model('Match', matchSchema);
