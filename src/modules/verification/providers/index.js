const providers = {
  didit: require('./didit.provider'),
};

function getProvider() {
  const name = process.env.KYC_PROVIDER || 'didit';
  const provider = providers[name];

  if (!provider) {
    const error = new Error(`Proveedor de verificación desconocido: ${name}`);
    error.status = 500;
    throw error;
  }

  return provider;
}

module.exports = { getProvider };
