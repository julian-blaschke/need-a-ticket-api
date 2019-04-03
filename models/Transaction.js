const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  amount: Number,
  date: Date,
  payerId: mongoose.Types.ObjectId,
  receiverId: mongoose.Types.ObjectId,
  ticketId: mongoose.Types.ObjectId,
}, {
  timestamps: true
});

exports.Transaction = mongoose.model('Transaction', TransactionSchema);
