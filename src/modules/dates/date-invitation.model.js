const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  placeId: { type: String, required: true },
  coordinates: { type: [Number], required: true },
  startsAt: { type: Date, required: true },
  note: { type: String, maxlength: 300, default: '' },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revision: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true });

schema.index({ match: 1, _id: -1 });
schema.index({ sender: 1 });
schema.index({ recipient: 1 });

module.exports = mongoose.model('DateInvitation', schema);
