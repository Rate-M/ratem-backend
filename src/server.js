require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
require('./modules/consents/consent.service');

const { getStreakThresholdDays } = require('./config/streak');

const PORT = process.env.PORT || 3000;

try {
  getStreakThresholdDays();
} catch (err) {
  console.error('Configuración inválida:', err.message);
  process.exit(1);
}

connectDB()
  .then(() => app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });