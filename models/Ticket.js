const mongoose = require('mongoose')
const {Types} = require('mongoose')
const {User} = require('./User')

const TicketSchema = new mongoose.Schema({
    type: String,
    price: Number,
    redeemed: Boolean,
    redeemedAt: Date,
    sellerId: mongoose.Types.ObjectId,
    buyerId: mongoose.Types.ObjectId,
    concertId: mongoose.Types.ObjectId,
}, {timestamps: true});

exports.Ticket = mongoose.model('Ticket', TicketSchema);