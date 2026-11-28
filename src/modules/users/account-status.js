function isSuspended(account, now = new Date()) {
  return Boolean(account?.suspendedPermanently || account?.suspendedUntil > now);
}

function availableAccount(now = new Date()) {
  return {
    suspendedPermanently: { $ne: true },
    $or: [{ suspendedUntil: null }, { suspendedUntil: { $lte: now } }],
  };
}

module.exports = { isSuspended, availableAccount };
