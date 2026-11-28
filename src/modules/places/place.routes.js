const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const Place = require('./place.model');
const { search, details } = require('./place.controller');

const router = Router();

router.use(authenticate, requireVerification);

router.get('/', search);
router.post('/proposals', async (req, res, next) => {
  try {
    const { name, category, address, hours = '', latitude, longitude } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
      !['cafe', 'parque', 'restaurante'].includes(category) ||
      typeof address !== 'string' || !address.trim() || address.trim().length > 200 ||
      typeof hours !== 'string' || hours.trim().length > 100 ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: 'Revisa los datos del lugar propuesto' });
    }
    const proposal = await Place.create({
      name: name.trim(), category, address: address.trim(), hours: hours.trim(),
      location: { type: 'Point', coordinates: [longitude, latitude] },
      source: 'community', createdBy: req.user.id,
    });
    return res.status(201).json({ id: proposal._id, status: proposal.status });
  } catch (error) { next(error); }
});

router.get('/community', async (req, res, next) => {
  try {
    const { lat, lng, category } = req.query;
    const valid = (value, limit) => typeof value === 'string' && value.trim() &&
      Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
    if (!valid(lat, 90) || !valid(lng, 180) ||
      (category !== undefined && !['cafe', 'parque', 'restaurante'].includes(category))) {
      return res.status(400).json({ message: 'Coordenadas o categoría inválidas' });
    }
    const places = await Place.find({
      source: 'community', status: 'approved', ...(category ? { category } : {}),
      location: { $near: { $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] }, $maxDistance: 5000 } },
    }).select('name category address hours location').limit(50).lean();
    return res.json({ places });
  } catch (error) { next(error); }
});
router.get('/:placeId', details);

module.exports = router;
