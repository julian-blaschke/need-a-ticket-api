const mongoose = require('mongoose');

const ConcertSchema = new mongoose.Schema({
    title: String,
    date: Date,
    address: String,
    genre: String,
    type: String,
    artistId: mongoose.Types.ObjectId,
}, {timestamps: true});

exports.Concert = mongoose.model('Concert', ConcertSchema);