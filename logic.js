const express = require('express')
const jwt = require("express-jwt")
const jsonwebtoken = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const mongoose = require('mongoose')
const config = require('./config')
const {PasswordMeter} = require('password-meter')
const { Types } = require('mongoose')
const { User } = require('./models/User')
const { Artist } = require('./models/Artist')
const { Ticket } = require('./models/Ticket')
const { Concert } = require('./models/Concert')
const { Transaction } = require('./models/Transaction')
const { Wallet } = require('./models/Wallet')
const { ApolloServer, gql, AuthenticationError,ApolloError } = require('apollo-server-express')

mongoose.connect('mongodb://julian-blaschke:Julian1999@ds247001.mlab.com:47001/need-a-ticket', {useNewUrlParser: true})

//********************************************************* queries *********************************************************
//		find an user and add all attributes
async function findOneUser({id}){
	if(!id)
		throw new ApolloError("no id passed")
	let _id = Types.ObjectId(id)
	let totalselling = await Ticket.find({
		sellerId: _id
	}).countDocuments()
	let totalredeemed = await Ticket.find({
		buyerId: _id,
		redeemed: true
	}).countDocuments()
	let totalbought = await Ticket.find({
		buyerId: _id
	}).countDocuments()
	let selling = await Ticket.find({
		sellerId: _id
	})
	let redeemed = await Ticket.find({
		buyerId: _id,
		redeemed: true
	})
	let bought = await Ticket.find({
		buyerId: _id
	})
	let user = await User.aggregate([
		{$lookup: { from: 'wallets',localField:'walletId',foreignField: '_id',as: 'wallet'}},
		{$unwind: "$wallet"},
		{$match : {_id }},
		{$limit : 1}
	])
	user = user.shift()
	user.totalSelling = totalselling
	user.totalBought = totalbought
	user.totalRedeemed = totalredeemed;
	user.selling = selling
	user.bought = bought
	user.redeemed = redeemed
	return user
}
// 		find all users and add no attributes
async function findAllUsers() {
 	return User.aggregate([
	    {$lookup: { from: 'wallets',localField:'walletId',foreignField: '_id',as: 'wallet'}},
	    {$unwind: "$wallet"},
	    {$lookup: { from: 'tickets',localField:'_id',foreignField: 'sellerId',as: 'selling'}},
	    {$lookup: { from: 'tickets',localField:'_id',foreignField: 'buyerId',as: 'bought'}},
	])
}
//		find an artist
async function findOneArtist ({id}){
	return Artist.findOne(Types.ObjectId(id))
}
//		find all artists
async function findAllArtists(){
	return Artist.find()
}
// 		find a concert and add all atributes
async function findOneConcert({id}){
	let concert = await Concert.aggregate([
        {$lookup: { from: 'artists',localField:'artistId',foreignField: '_id',as: 'artist'}},
        {$unwind: "$artist"},
        {$lookup: { from: 'tickets', localField: '_id', foreignField: 'concertId' , as : 'tickets' }},
        {$match : {_id : Types.ObjectId(id)}},
        {$limit : 1}
	])
	concert = concert.shift()
	await concert.tickets.forEach( async(ticket) => {
		ticket.seller = findOneUser({id : ticket.sellerId})
		if(ticket.buyerId)
				ticket.buyer = await findOneUser({id : ticket.buyerId})	
	})
	return concert
}
//		find all concerts and add all attributes
async function findAllConcerts(){
	let concerts = await Concert.aggregate([
		{$lookup: { from: 'artists',localField:'artistId',foreignField: '_id',as: 'artist'}},
		{$unwind: "$artist"},
		{$lookup: { from: 'tickets', localField: '_id', foreignField: 'concertId' , as : 'tickets' }}
	])
	await concerts.forEach(	async(concert) => {
		await concert.tickets.forEach( async(ticket) => {
			ticket.seller =  await findOneUser({id: ticket.sellerId})	
			if(ticket.buyerId)
				ticket.buyer = await findOneUser({id: ticket.buyerId})	
		})
	})
	return concerts
}
//		find an ticket and aggregate it
async function findOneTicket({id}){
	let ticket =  await Ticket.aggregate([
		{$lookup: { from: 'users',localField:'sellerId',foreignField: '_id',as: 'seller'}},
		{$unwind: "$seller"},
		{$lookup: { from: 'users',localField:'buyerId',foreignField: '_id',as: 'buyer'}},
		{$unwind: { path:"$buyer", preserveNullAndEmptyArrays: true}},
		{$lookup: { from: 'concerts',localField:'concertId',foreignField: '_id',as: 'concert'}},
		{$unwind: "$concert"},
		{$match : {_id : Types.ObjectId(id)}},
		{$limit : 1}
	])	
	return ticket.shift()
}
//		find all tickets and aggregate them
async function findAllTickets(){
	let tickets =  await Ticket.aggregate([
		{$lookup: { from: 'users',localField:'sellerId',foreignField: '_id',as: 'seller'}},
		{$unwind: "$seller"},
		{$lookup: { from: 'users',localField:'buyerId',foreignField: '_id',as: 'buyer'}},
		{$unwind: { path:"$buyer", preserveNullAndEmptyArrays: true}},
		{$lookup: { from: 'concerts',localField:'concertId',foreignField: '_id',as: 'concert'}},
		{$unwind: "$concert"}
	])
	return tickets
}
//		find all tickets and group them by concert, seller and price
async function findAndGroupTickets({concertId}){
	if(concertId){
		let tickets = await Ticket.aggregate([
			{$match: {buyerId: {$exists: true}} },
			{$group: {_id: {concertId: '$concertId', sellerId: "$sellerId", price: '$price', type: '$type' }, count: {$sum: 1}}},
			{$lookup: { from: 'users',localField:'_id.sellerId',foreignField: '_id',as: 'seller'}},
			{$unwind: "$seller"},
			{$lookup: { from: 'concerts',localField:'_id.concertId',foreignField: '_id',as: 'concert'}},
			{$unwind: "$concert"},
			{$project: {concert: "$concert", seller: "$seller", price: '$_id.price', available: "$count", type: "$_id.type", _id : 0 }},
			{$match : {"concert._id" : Types.ObjectId(concertId)}},
		])
		for(let ticket of tickets){
			ticket.concert.artist = await findOneArtist({id: ticket.concert.artistId})
		}
		return tickets;
	}
	let tickets = await Ticket.aggregate([
		{$match: {buyerId: {$exists: true}} },
		{$group: {_id: {concertId: '$concertId', sellerId: "$sellerId", price: '$price', type: '$type' }, count: {$sum: 1}}},
		{$lookup: { from: 'users',localField:'_id.sellerId',foreignField: '_id',as: 'seller'}},
		{$unwind: "$seller"},
		{$lookup: { from: 'concerts',localField:'_id.concertId',foreignField: '_id',as: 'concert'}},
		{$unwind: "$concert"},
		{$project: {concert: "$concert", seller: "$seller", price: '$_id.price', available: "$count", type: "$_id.type", _id : 0 }}
	])
	for(let ticket of tickets){
		ticket.concert.artist = await findOneArtist({id: ticket.concert.artistId})
	}
	return tickets
}
//		find one transaction and aggregate it
async function findOneTransaction({id}){
	let transaction = await Transaction.aggregate([
		{$lookup: { from: 'users',localField:'payerId',foreignField: '_id',as: 'payer'}},
		{$unwind: "$payer"},
		{$lookup: { from: 'users',localField:'receiverId',foreignField: '_id',as: 'receiver'}},
		{$unwind: "$receiver"},
		{$lookup: { from: 'tickets',localField:'ticketId',foreignField: '_id',as: 'ticket'}},
		{$unwind: "$ticket"},
		{$match : {_id : Types.ObjectId(id)}},
		{$limit : 1}
	])
	return transaction.shift()	
}
//		find all transactions and aggregate them
async function findAllTransactions(){
	return await Transaction.aggregate([
		{$lookup: { from: 'users',localField:'payerId',foreignField: '_id',as: 'payer'}},
		{$unwind: "$payer"},
		{$lookup: { from: 'users',localField:'receiverId',foreignField: '_id',as: 'receiver'}},
		{$unwind: "$receiver"},
		{$lookup: { from: 'tickets',localField:'ticketId',foreignField: '_id',as: 'ticket'}},
		{$unwind: "$ticket"},
	])
}
//********************************************************* mutations *********************************************************
//		sign an user up with at least email and password (username optional) --> passwordhash, passwordstregth and wallet are being generated --> returns an jwt
async function signUp ({username,email,password}){
	if(email)
		if(await User.findOne({email}))
			throw new ApolloError("an user with this email already exists")
	let wallet = new Wallet({
		balance: 0
	})
	let passwordStrength = await new PasswordMeter({},{
		"50": "very weak",  // 001 <= x <  040
		"100": "weak",  // 040 <= x <  080
		"150": "average", // 080 <= x <  120
		"200": "strong", // 120 <= x <  180
		"_": "very strong"   //        x >= 200
	}).getResult(password)

	await wallet.save()

	let user = new User({
		username,
		email,
		password: await bcrypt.hash(password, 10),
		walletId: wallet._id,
		passwordStrength
	})
	await user.save()

	// Return json web token
	return jsonwebtoken.sign(
		{ id: user.id, email: user.email },
		global.config.secret,
		{ expiresIn: '1y' }
	)
}
//		loggs in an user with email and password --> returns an jwt
async function login ({email,password}){
	const user = await User.findOne({ email: email })
	if (!user) 
		throw new Error('No user with that email')
	const valid = await bcrypt.compare(password, user.password)

	if (!valid)
	throw new Error('Incorrect password')

	// Return json web token
	return await jsonwebtoken.sign(
		{ id: user.id, email: user.email },
		global.config.secret,
		{ expiresIn: '1y' }
	)
}
//		loggs in staff members for a concert
async function loginStaff({concertId}){
	const concert = await Concert.findOne(Types.ObjectId(concertId))

	if (!concert) {
		throw new Error('No concert with that id')
	}

	// Return json web token
	return await jsonwebtoken.sign(
		{ id: concert.id, role: "staff" },
		global.config.secret,
		{ expiresIn: '1y' }
	)
}
//		inserts one artist	
async function insertOneArtist({name}){
	let artist = new Artist({name})
	await artist.save((err) => {
	if (err)
		throw err
	})
	return artist
}
// 		insert one concert
async function insertOneConcert({title,date,address,capacity,artistId,sellerId}){
	artistId = Types.ObjectId(artistId)
	let concert = new Concert({
		title,date,address,capacity,artistId,sellerId
	})
	await concert.save((err) => {
	if(err)
		throw err
	})
	return await findOneConcert({id: concert._id.toString()})
}
//		insert one ticket
async function insertOneTicket({type,price,concertId,redeemedAt,buyerId,sellerId}){
	sellerId = Types.ObjectId(sellerId)
	concertId = Types.ObjectId(concertId)
	let redeemed = false
	if(buyerId)
	buyerId = Types.ObjectId(buyerId)
	let ticket = new Ticket({
	type,price,redeemed,redeemedAt,sellerId,buyerId,concertId
	})
	await ticket.save((err)=>{
	if(err)
		throw err
	})
	return ticket
}
//		insert many tickets
async function insertManyTickets({amount,type,price,concertId,redeemedAt,buyerId,sellerId}){
	sellerId = Types.ObjectId(sellerId)
	concertId = Types.ObjectId(concertId)
	if(buyerId)
		buyerId = Types.ObjectId(buyerId)
	let redeemed = false
	let tickets = []

	for(let count = 0; count < amount;count++){
		tickets.push(
			new Ticket({
				type,price,redeemed,redeemedAt,sellerId,buyerId,concertId
			})
		)
	}
	await Ticket.collection.insertMany(tickets)
	return tickets
}
// 		update one user
async function updateOneUser({email,password,userId}){
	let _id = Types.ObjectId(userId)
	if(email){
		await User.updateOne(
			{ _id },
			{ $set : { email } }
		)
	}
	if(password){
		let passwordStrength = await new PasswordMeter({},{
			"50": "very weak",  // 001 <= x <  040
			"100": "weak",  // 040 <= x <  080
			"150": "average", // 080 <= x <  120
			"200": "strong", // 120 <= x <  180
			"_": "very strong"   //        x >= 200
		}).getResult(password)
		await User.updateOne(
			{ _id },
			{ $set : { password: await bcrypt.hash(password, 10) , passwordStrength} }
		)
	}
	return await findOneUser({id:_id})
}
// 		buy one ticket
async function buyOneTicket({ticketId,userId}){
	//need to create transaction / update both receiver and payer Wallet / and update ticket
	payerId = Types.ObjectId(userId)
	ticketId = Types.ObjectId(ticketId)
	date = new Date()

	let ticket = await Ticket.findOne(ticketId)
	let receiverId = Types.ObjectId(ticket.sellerId)
	let amount = ticket.price 
	let payer = await User.findOne(payerId)
	let receiver = await User.findOne(receiverId)

	
	//decrease payer wallet
	await Wallet.updateOne(
	  { "_id" : payer.walletId },
	  { $inc : { balance: amount } }
	)

	//increase receiver wallet
	await Wallet.updateOne(
	  { "_id" : receiver.walletId },
	  { $inc : { balance: -amount } }
	)
	
	//create the transaction
	let transaction = new Transaction({
	  amount,date,payerId,receiverId,ticketId
	})

	await transaction.save()

	//update buyer in ticket
	await Ticket.updateOne(
		{ "_id" : ticketId },
		{ $set : { buyerId: payerId } }
	)

	return transaction
}
//		buy many tickets
async function buyManyTickets({number,concertId,sellerId,price,userId}){
	//need to create transaction / update both receiver and payer Wallet / and update ticket
	payerId = Types.ObjectId(userId)
	concertId = Types.ObjectId(concertId)
	sellerId = Types.ObjectId(sellerId)
	//buy tickets
	date = new Date()
	
	let receiverId = Types.ObjectId(sellerId)
	let payer = await User.findOne(payerId)
	let receiver = await User.findOne(receiverId)
	let amount = price * number

	//decrease payer wallet
	await Wallet.updateOne(
		{ "_id" : payer.walletId },
		{ $inc : { balance: amount } }
	)

	//increase receiver wallet
	await Wallet.updateOne(
		{ "_id" : receiver.walletId },
		{ $inc : { balance: -amount } }
	)

	//create the transaction
	let transaction = new Transaction({
	  amount,date,payerId,receiverId,concertId
	})

	await transaction.save()

	//update buyer in ticket
	let tickets = await Ticket.find({
	  concertId,sellerId,price
	}).limit(number)

	await tickets.forEach( async (el) => { 
	  el.buyerId = payerId
	  await Ticket.collection.save(el)
	})

	return transaction
}
//		deposit or withdraw money from an users wallet
async function deposit({amount,userId}){
	userId = Types.ObjectId(userId)

	let user = await User.findOne(userId)

	await Wallet.updateOne(
	  { "_id" : user.walletId },
	  { $inc : { balance: amount } }
	)

	return Wallet.findOne(user.walletId)
}
// 		redeem an ticket if not already redeemed
async function redeemOneTicket({ticketId,user}){
	ticketId = Types.ObjectId(ticketId)
	let redeemedAt = new Date()
	let ticket = await Ticket.findOne(ticketId)
	if(user.role != "staff")
	throw new AuthenticationError("your not logged in as staff")
	if(ticket.concertId +"" !=  Types.ObjectId(user.id)+"")
	throw new AuthenticationError("you cannot redeem tickets for other concerts")
	if(!ticket)
	throw new ApolloError("ticket not found", 404)
	if(ticket.redeemed)
	throw new ApolloError("ticket already redeemed.",400)
	await Ticket.updateOne(
	{ "_id" : ticketId },
	{ $set : { redeemed: true, redeemedAt } }
	)

	return findOneTicket({id: ticketId})
}

const logic = {
	User: {
		findOne: findOneUser,
		find: findAllUsers,
		signup: signUp,
		updateOne: updateOneUser,
		deposit: deposit,
		login: login,
		loginStaff: loginStaff
	},
	Artist: {
		findOne: findOneArtist,
		find: findAllArtists,
		insertOne: insertOneArtist
	},
	Concert: {
		findOne: findOneConcert,
		find: findAllConcerts,
		insertOne: insertOneConcert
	},
	Ticket: {
		findOne: findOneTicket,
		find: findAllTickets,
		findAndGroup: findAndGroupTickets,
		insertOne: insertOneTicket,
		insertMany: insertManyTickets,
		buyOne: buyOneTicket,
		buyMany: buyManyTickets,
		redeemOne: redeemOneTicket
	},
	Transaction: {
		findOne: findOneTransaction,
		find: findAllTransactions
	}
}
exports.logic = logic