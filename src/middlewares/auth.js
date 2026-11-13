const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub)) {
      throw new Error('Identificador inválido');
    }
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }

  try {
    const account = await User.findById(payload.sub);
    if (!account || account.deletionRequestedAt) {
      return res.status(401).json({ message: 'Cuenta no disponible' });
    }
    req.account = account;
    req.user = { id: payload.sub, role: account.role };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticate;
