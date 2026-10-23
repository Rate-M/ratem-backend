const {
  serializeSession,
  startVerification,
  handleWebhook,
} = require('./verification.service');

async function start(req, res, next) {
  try {
    const { session, created } = await startVerification(req.user.id);
    res.status(created ? 201 : 200).json(serializeSession(session));
  } catch (error) {
    next(error);
  }
}

async function webhook(req, res, next) {
  try {
    await handleWebhook({
      rawBody: req.rawBody,
      headers: req.headers,
      body: req.body,
    });

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { start, webhook };
