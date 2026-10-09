const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

const authRoutes = require('./modules/auth/auth.routes');
app.use('/api/auth', authRoutes);

const consentRoutes = require('./modules/consents/consent.routes');
app.use('/api/consents', consentRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Error interno' });
});

module.exports = app;