const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer;
  },
}));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

const authRoutes = require('./modules/auth/auth.routes');
app.use('/api/auth', authRoutes);

app.use('/api/users', require('./modules/users/user.routes'));

const consentRoutes = require('./modules/consents/consent.routes');
app.use('/api/consents', consentRoutes);

const profileRoutes = require('./modules/profiles/profile.routes');
app.use('/api/profiles', profileRoutes);

const verificationRoutes = require('./modules/verification/verification.routes');
app.use('/api/verification', verificationRoutes);

const placeRoutes = require('./modules/places/place.routes');
app.use('/api/places', placeRoutes);
const configRoutes = require('./modules/config/config.routes');
app.use('/api/config', configRoutes);
const swipeRoutes = require('./modules/swipes/swipe.routes');
app.use('/api/swipes', swipeRoutes);
const { matchRoutes, notificationRoutes } = require('./modules/matches/match.routes');
app.use('/api/matches', matchRoutes);
app.use('/api/matches', require('./modules/messages/message.routes'));
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const { uploadDirectory } = require('./modules/profiles/photo.service');

app.use('/uploads/profiles', express.static(uploadDirectory));

app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: 'Cada foto debe pesar máximo 5 MB',
      LIMIT_FILE_COUNT: 'Puedes subir máximo 6 fotos',
      LIMIT_UNEXPECTED_FILE: 'Usa el campo photos y sube máximo 6 fotos',
      LIMIT_FIELD_COUNT: 'Puedes enviar máximo 8 campos de texto',
    };

    return res.status(400).json({
      message: messages[err.code] || 'Error al cargar las fotos',
    });
  }

  next(err);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Error interno' });
});

module.exports = app;
