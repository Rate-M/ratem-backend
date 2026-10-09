const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');
const { create, getMe } = require('./profile.controller');

const router = Router();

router.use(authenticate);

router.post('/me', upload.array('photos', 6), create);
router.get('/me', getMe);

module.exports = router;