require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
require('./modules/consents/consent.service');

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });