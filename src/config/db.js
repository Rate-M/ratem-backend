const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

module.exports = async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB conectado');
};