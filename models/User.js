var mongoose = require('mongoose');

var UserSchema = new mongoose.Schema({
  username: String,
  password: String,
  email: String,
  walletId: mongoose.Types.ObjectId,
  passwordStrength: new mongoose.Schema({
    score: Number,
    status: String,
    percent: Number
  })
}, {timestamps: true});

exports.User = mongoose.model('User', UserSchema);