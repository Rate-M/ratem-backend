const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');
const { sendMessage } = require('../modules/messages/message.service');

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub) ||
      !Number.isFinite(payload.exp)) throw new Error('JWT inválido');
    return { userId: payload.sub.toLowerCase(), expiresAt: payload.exp * 1000 };
  } catch {
    const error = new Error('Token inválido o expirado');
    error.status = 401;
    throw error;
  }
}

function errorData(error) {
  return {
    status: error.status || 500,
    message: error.status ? error.message : 'No se pudo procesar el mensaje',
  };
}

function attachSocketServer(httpServer) {
  const origin = process.env.CLIENT_URL;
  const io = new Server(httpServer, {
    cors: { origin },
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (req, callback) => callback(null, !req.headers.origin || req.headers.origin === origin),
  });
  const rates = new Map();
  let lastCleanup = 0;

  function consume(userId) {
    const now = Date.now();
    if (now - lastCleanup > 60000) {
      for (const [id, bucket] of rates) if (bucket.until <= now) rates.delete(id);
      lastCleanup = now;
    }
    let bucket = rates.get(userId);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + 60000 };
      rates.set(userId, bucket);
    }
    if (++bucket.count > 30) {
      const error = new Error('Demasiados mensajes, intenta de nuevo en un minuto');
      error.status = 429;
      throw error;
    }
  }

  io.use(async (socket, next) => {
    try {
      const identity = verifyToken(socket.handshake.auth?.token);
      const user = await User.findById(identity.userId);
      if (!user || user.deletionRequestedAt || user.verificationStatus !== 'approved') {
        const error = new Error('Cuenta no disponible para chat');
        error.status = 403;
        throw error;
      }
      socket.data.identity = identity;
      next();
    } catch (error) {
      const rejected = new Error(errorData(error).message);
      rejected.data = errorData(error);
      next(rejected);
    }
  });

  io.on('connection', (socket) => {
    const { userId, expiresAt } = socket.data.identity;
    socket.join(`user:${userId}`);
    let expiryTimer;
    function scheduleExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) return socket.disconnect(true);
      expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647));
      expiryTimer.unref();
    }
    scheduleExpiry();
    socket.on('disconnect', () => clearTimeout(expiryTimer));

    socket.on('message:send', async (data, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      try {
        verifyToken(socket.handshake.auth?.token);
        consume(userId);
        const message = await sendMessage(userId, data);
        // Persistencia antes de emitir y confirmar; todas las pestañas reciben el mismo id.
        io.to([`user:${message.senderId}`, `user:${message.recipientId}`]).emit('message:new', message);
        acknowledge({ ok: true, message });
      } catch (error) {
        acknowledge({ ok: false, error: errorData(error) });
        if (error.status === 401) socket.disconnect(true);
      }
    });
  });

  return io;
}

module.exports = { attachSocketServer };
