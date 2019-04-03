const express = require('express')
const jwt = require("express-jwt")
const mongoose = require('mongoose')
const config = require('./config')
const { logic } = require('./logic')
const { ApolloServer, gql, AuthenticationError } = require('apollo-server-express')
const {makeExecutableSchema, addSchemaLevelResolveFunction} = require('graphql-tools')


global.config = config

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  scalar Date
  type User {
    _id: ID!
    username: String
    email: String!
    wallet: Wallet!
    selling: [Ticket]
    bought: [Ticket]
    redeemed: [Ticket]
    totalSelling: Int
    totalBought: Int
    totalRedeemed: Int
    passwordStrength: PasswordMeter
  }
  type PasswordMeter {
    score: Float!,
    status: String!,
    percent: Float!
  }
  type Artist {
    _id: ID,
    name: String!
  }
  type Concert {
    _id: ID!
    title: String!
    date: Date!
    address: String!,
    genre: String,
    type: String,
    capacity: Float!
    tickets: [Ticket]
    totalTickets: Int
    artist: Artist
  }
  type Ticket {
    _id: ID!
    type: String!
    price: Float!
    redeemed: Boolean!
    redeemedAt: Date
    seller: User!
    buyer: User
    concert: Concert!
  }
  type Wallet {
    _id: ID!
    balance: Float!
  }
  type Transaction {
    _id: ID!
    date: Date!
    amount: Float!
    payer: User!
    receiver: User!
    ticket: Ticket!
  }
  type groupedTicket{
    concert: Concert! 
    price: Float!
    seller: User!
    type: String!,
    available: Float!
  }
  type Query {
    me: User
    users:[User]
    user(id: ID!): User
    artists: [Artist]
    artist(id: ID!): Artist
    concerts: [Concert]
    concert(id: ID!): Concert
    tickets: [Ticket]
    ticketsGrouped(concertId: ID): [groupedTicket]
    ticket(id: ID!): Ticket
    transactions: [Transaction]
    transaction(id: ID!): Transaction
  }
  type Mutation {
    signup (username: String, email: String!, password: String!): String
    login (email: String!, password: String!): String
    staffLogin (concertId: ID!): String
    createArtist (name: String!): Artist
    createConcert (title: String!, date: Date!, address: String!, genre: String!,type: String!, capacity: Float!, artistId: ID!): Concert
    createTicket (type: String!, price: Float!,concertId: String!,redeemedAt: Date, buyerId: String): Ticket
    createTickets (amount: Float!, type: String!, price: Float!,concertId: String!,redeemedAt: Date, buyerId: String): [Ticket]
    updateUser (email: String, password: String) : User
    buy (ticketId: ID!): Transaction
    buyBulk (number: Float!, concertId: ID!, sellerId: ID!, price: Float!): Transaction 
    deposit (amount: Float!): Wallet
    redeem (ticketId: String!): Ticket
  }
`



// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    async me(_,{},context){
      return await logic.User.findOne({id:context.user.id})
    },

    async user(_,{id}) {
      return await logic.User.findOne({id})
    },

    async users() {
      return await logic.User.find()
    },

    async artist(_,{id}) {
      return await logic.Artist.findOne({id})
    },

    async artists() {
      return await logic.Artist.find()
    },

    async concert(_,{id}) {
      return await logic.Concert.findOne({id})
    },

    async concerts(){
      return await logic.Concert.find()
    },

    async ticket(_,{id}){
      return logic.Ticket.findOne({id})
    },

    async tickets(){
      return logic.Ticket.find()
    },

    async ticketsGrouped(_,{concertId}){
      return logic.Ticket.findAndGroup({concertId})
    },

    async transaction(_,{id}){
      return logic.Transaction.findOne({id})  
    },

    async transactions(){
      return logic.Transaction.find()
    },
  },

  Mutation: {
    async signup(_, { username, email, password }) {
      return logic.User.signup({username,email,password})
    },

    async login(_, { email, password }) {
      return logic.User.login({email,password})
    },

    async staffLogin(_, { concertId }) {
      return logic.User.loginStaff({concertId})
    },

    async createArtist(_, {name}) {
      return logic.Artist.insertOne({name})
    },

    async createConcert(_,{title,date,address,genre,type,capacity,artistId},context) {
      return logic.Concert.insertOne({title,date,address,genre,capacity,artistId,sellerId: context.user.id})
    },

    async createTicket(_,{type,price,concertId,redeemedAt,buyerId},context){
      return await logic.Ticket.insertOne({type,price,concertId,redeemedAt,buyerId,sellerId: context.user.id})
    },

    async createTickets(_,{amount,type,price,concertId,redeemedAt,buyerId},context){
      return logic.Ticket.insertMany({amount,type,price,concertId,redeemedAt,buyerId,sellerId: context.user.id})
    },

    async updateUser(_,{email,password},context){
      return logic.User.updateOne({email,password,userId:context.user.id})
    },

    async buy(_,{ticketId},context){
      return logic.Ticket.buyOne({ticketId,userId: context.user.id})
    },

    async buyBulk(_,{number,concertId,sellerId,price},context){
      return logic.Ticket.buyMany({number,concertId,sellerId,price,userId:context.user.id})
    },

    async deposit(_,{amount},context){
      return logic.User.deposit({amount,userId:context.user.id})
    },

    async redeem(_,{ticketId},context){
      return logic.Ticket.redeemOne({ticketId,user: context.user})
    }

  }
}

//database
mongoose.connect('mongodb://julian-blaschke:Julian1999@ds247001.mlab.com:47001/need-a-ticket', {useNewUrlParser: true})

//auth exception middleware
const schema = makeExecutableSchema({typeDefs, resolvers})
addSchemaLevelResolveFunction(schema, (root, args, context, info) => {
  if(!context.user)
    if(info.fieldName !== 'login' && info.fieldName !== 'signup' && info.fieldName !== "staffLogin")
      throw new AuthenticationError("not authenticated.")  
})

//create apollo server
const server = new ApolloServer({ schema, introspection: true, playground: true, context: ({ req }) => ({
    user: req.user
  })
})

const app = express()

//auth middleware
const auth = jwt({
  secret: global.config.secret,
  credentialsRequired: false,
})


//apply middleware
app.use(auth)

server.applyMiddleware({ app })

app.listen({ port: process.env.PORT || 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
)
