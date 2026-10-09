const Consent = require('../src/modules/consents/consent.model');
const { CURRENT_VERSIONS } = require('../src/config/legal');

test.each(['privacy', 'terms'])(
  'El consentimiento %s incluye versión y fecha',
  (type) => {
    const start = Date.now();

    const consent = new Consent({
      user: '507f1f77bcf86cd799439011',
      type,
      version: CURRENT_VERSIONS[type],
    });

    expect(consent.validateSync()).toBeUndefined();
    expect(consent.version).toBe('1.0');
    expect(consent.acceptedAt).toBeInstanceOf(Date);
    expect(consent.acceptedAt.getTime()).toBeGreaterThanOrEqual(start);
    expect(consent.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(consent.revokedAt).toBeNull();
  }
);