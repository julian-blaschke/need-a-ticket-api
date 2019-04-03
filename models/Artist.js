const mongoose = require('mongoose');

const ArtistSchema = new mongoose.Schema({
  name: String
}, {
  timestamps: true
});

exports.Artist = mongoose.model('Artist', ArtistSchema);
