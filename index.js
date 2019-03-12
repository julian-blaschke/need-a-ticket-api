const express = require('express')
const jwt = require("express-jwt")
const jsonwebtoken = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const mongoose = require('mongoose')
const { Types } = require('mongoose')
const { User } = require('./models/User')
const { Artist } = require('./models/Artist')
const { Ticket } = require('./models/Ticket')
const { Concert } = require('./models/Concert')
const { Transaction } = require('./models/Transaction')
const { Wallet } = require('./models/Wallet')
const { ApolloServer, gql } = require('apollo-server-express')

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  scalar Date
  type User {
    _id: ID!
    username: String!
    email: String!
    password: String!,
    wallet: Wallet!,
  }
  type Artist {
    _id: ID,
    name: String!
  }
  type Concert {
    _id: ID!,
    title: String!,
    date: Date!,
    address: String!,
    capacity: Float!,
    tickets: [Ticket],
    artist: Artist,
  }
  type Ticket {
    _id: ID!,
    type: String!,
    price: Float!,
    redeemed: Boolean!,
    redeemedAt: Date,
    seller: User!,
    buyer: User,
    concert: Concert!,
  }
  type Wallet {
    _id: ID!,
    balance: Float!,
  }
  type Transaction {
    _id: ID!,
    date: Date!,
    amount: Float!,
    payer: User!,
    receiver: User!,
    ticket: Ticket!,
  }
    type groupedTicket{
    concert: Concert!, 
    price: Float!,
    seller: User!,
    available: Float!
  }
  type Query {
    users:[User],
    user(id: ID!): User,
    artists: [Artist],
    artist(id: ID!): Artist,
    concerts: [Concert],
    concert(id: ID!): Concert,
    tickets: [Ticket],
    ticketsGrouped: [groupedTicket],
    ticket(id: ID!): Ticket,
    transactions: [Transaction],
    transaction(id: ID!): Transaction,
  }
  type Mutation {
    signup (username: String!, email: String!, password: String!): String
    login (email: String!, password: String!): String
    createArtist (name: String!): Artist
    createConcert (title: String!, date: Date!, address: String!, capacity: Float!, artistId: ID!): Concert
    createTicket (type: String!, price: Float!, sellerId: String!,concertId: String!,redeemedAt: Date, buyerId: String): Ticket
    createTickets (amount: Float!, type: String!, price: Float!, sellerId: String!,concertId: String!,redeemedAt: Date, buyerId: String): [Ticket]
    buy (ticketId: ID!, payerId: ID!): Transaction
    buyBulk (number: Float!, concertId: ID!, sellerId: ID!, price: Float!, payerId: ID!): Transaction 
    deposit (amount: Float!, userId: ID!): Wallet
  }
`



// Provide resolver functions for your schema fields
const resolvers = {
  Query: {

    async user(_,{id}) {
      let user = await User.aggregate([
        {$lookup: { from: 'wallets',localField:'walletId',foreignField: '_id',as: 'wallet'}},
        {$unwind: "$wallet"},
        {$match : {_id : Types.ObjectId(id)}},
        {$limit : 1}
      ])
      return user.shift()
    },

    async users() {
      return User.aggregate([
        {$lookup: { from: 'wallets',localField:'walletId',foreignField: '_id',as: 'wallet'}},
        {$unwind: "$wallet"}
      ])
    },

    async artist(_,{id}) {
      return Artist.findOne(Types.ObjectId(id))
    },

    async artists() {
      return Artist.find()
    },

    async concert(_,{id}) {
      let concert = await Concert.aggregate([
        {$lookup: { from: 'artists',localField:'artistId',foreignField: '_id',as: 'artist'}},
        {$unwind: "$artist"},
        {$lookup: { from: 'tickets', localField: '_id', foreignField: 'concertId' , as : 'tickets' }},
        {$match : {_id : Types.ObjectId(id)}},
        {$limit : 1}
      ])
      return concert.shift()
    },

    async concerts(){
      return Concert.aggregate([
        {$lookup: { from: 'artists',localField:'artistId',foreignField: '_id',as: 'artist'}},
        {$unwind: "$artist"},
        {$lookup: { from: 'tickets', localField: '_id', foreignField: 'concertId' , as : 'tickets' }}
        ])
    },

    async ticket(_,{id}){
      let ticket =  await Ticket.aggregate([
          {$lookup: { from: 'users',localField:'sellerId',foreignField: '_id',as: 'seller'}},
          {$unwind: "$seller"},
          {$lookup: { from: 'users',localField:'buyerId',foreignField: '_id',as: 'buyer'}},
          {$unwind: "$buyer"},
          {$lookup: { from: 'concerts',localField:'concertId',foreignField: '_id',as: 'concert'}},
          {$unwind: "$concert"},
          {$match : {_id : Types.ObjectId(id)}},
          {$limit : 1}
      ])
      return ticket.shift()
    },

    async tickets(){
      return await Ticket.aggregate([
        {$lookup: { from: 'users',localField:'sellerId',foreignField: '_id',as: 'seller'}},
        {$unwind: "$seller"},
        {$lookup: { from: 'users',localField:'buyerId',foreignField: '_id',as: 'buyer'}},
        {$unwind: "$buyer"},
        {$lookup: { from: 'concerts',localField:'concertId',foreignField: '_id',as: 'concert'}},
        {$unwind: "$concert"},
      ])
    },

    async ticketsGrouped(){
      let tickets =  await Ticket.aggregate([
        {$match: {redeemed: false} },
        {$group: {_id: {concertId: '$concertId', sellerId: "$sellerId", price: '$price' }, count: {$sum: 1}}},
        {$lookup: { from: 'users',localField:'_id.sellerId',foreignField: '_id',as: 'seller'}},
        {$unwind: "$seller"},
        {$lookup: { from: 'concerts',localField:'_id.concertId',foreignField: '_id',as: 'concert'}},
        {$unwind: "$concert"},
        {$project: {concert: "$concert", seller: "$seller", price: '$_id.price', available: "$count", _id : 0 }}
      ])
      return tickets
    },

    async transactions(){
      return await Transaction.aggregate([
        {$lookup: { from: 'users',localField:'payerId',foreignField: '_id',as: 'payer'}},
        {$unwind: "$payer"},
        {$lookup: { from: 'users',localField:'receiverId',foreignField: '_id',as: 'receiver'}},
        {$unwind: "$receiver"},
        {$lookup: { from: 'tickets',localField:'ticketId',foreignField: '_id',as: 'ticket'}},
        {$unwind: "$ticket"},
      ])
    },

    async transaction(_,{id}){
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

  },

  Mutation: {
    async signup(_, { username, email, password }) {
      let wallet = new Wallet({
        balance: 0
      })
      
      await wallet.save()

      let user = new User({
        username,
        email,
        password: await bcrypt.hash(password, 10),
        walletId: wallet._id
      });

      await user.save();

      // Return json web token
      return jsonwebtoken.sign(
        { id: user.id, email: user.email },
        "process.env.JWT_SECRET",
        { expiresIn: '1y' }
      );
    },

    async login(_, { email, password }) {
      const user = await User.findOne({ email: email })

      if (!user) {
        throw new Error('No user with that email')
      }

      const valid = await bcrypt.compare(password, user.password)

      if (!valid) {
        throw new Error('Incorrect password')
      }

      // Return json web token
      return jsonwebtoken.sign(
        { id: user.id, email: user.email },
        "process.env.JWT_SECRET",
        { expiresIn: '1y' }
      )
    },

    async createArtist(_, {name}) {
      let artist = new Artist({name})
      await artist.save((err) => {
        if (err)
          throw err
      })
      return artist
    },

    async createConcert(_,{title,date,address,capacity,artistId}) {
      artistId = Types.ObjectId(artistId)
      let concert = new Concert({
        title,date,address,capacity,artistId
      })
      await concert.save((err) => {
        if(err)
          throw err
      })
      return concert
    },

    async createTicket(_,{type,price,sellerId,concertId,redeemedAt,buyerId}){
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
    },

    async createTickets(_,{amount,type,price,sellerId,concertId,redeemedAt,buyerId}){
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
    },

    async buy(_,{ticketId,payerId}){
      //need to create transaction / update both receiver and payer Wallet / and update ticket
      payerId = Types.ObjectId(payerId)
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
          { $set : { buyerId: payerId, redeemed: true } }
      )

      return transaction
    },

    async buyBulk(_,{number,concertId,sellerId,price,payerId}){
      //need to create transaction / update both receiver and payer Wallet / and update ticket
      payerId = Types.ObjectId(payerId)
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
        el.redeemed = true
        el.redeemedAt = Date()
        el.buyerId = payerId
        await Ticket.collection.save(el)
      })

      return transaction
    },

    async deposit(_,{amount,userId}){
      userId = Types.ObjectId(userId)

      let user = await User.findOne(userId)

      await Wallet.updateOne(
        { "_id" : user.walletId },
        { $inc : { balance: amount } }
      )

      return Wallet.findOne(user.walletId)
    }

  }
}


mongoose.connect('mongodb://julian-blaschke:Julian1999@ds247001.mlab.com:47001/need-a-ticket', {useNewUrlParser: true})

const server = new ApolloServer({ typeDefs, resolvers, introspection: true, playground: true })

// auth middleware
const auth = jwt({
  secret: "process.env.JWT_SECRET",
  credentialsRequired: false
})

const app = express()
app.use(auth)

server.applyMiddleware({ app })

app.listen({ port: process.env.PORT || 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
)
