const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  balance: Number
}, {
  timestamps: true
});

exports.Wallet = mongoose.model('Wallet', WalletSchema);
