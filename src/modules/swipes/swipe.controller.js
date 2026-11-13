const { serializeSwipe, createSwipe } = require('./swipe.service');

async function create(req, res, next) {
  try {
    const swipe = await createSwipe(req.user.id, req.body);
    res.status(201).json(serializeSwipe(swipe));
  } catch (error) {
    next(error);
  }
}

module.exports = { create };
