const depositStates = new Map();

const DEPOSIT_STATUS = {
  AWAITING_SLIP: 'awaiting_slip',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
};

function getDepositState(userId) {
  return depositStates.get(userId) || null;
}

function setDepositState(userId, state) {
  if (!state) {
    depositStates.delete(userId);
    return;
  }

  depositStates.set(userId, { ...state, updated_at: Date.now() });
}

function hasPendingDeposit(userId) {
  const state = getDepositState(userId);
  return Boolean(state && state.status === DEPOSIT_STATUS.AWAITING_SLIP);
}

setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000;
  for (const [key, state] of depositStates.entries()) {
    if (now - state.updated_at > maxAge) {
      depositStates.delete(key);
    }
  }
}, 60000);

module.exports = {
  DEPOSIT_STATUS,
  getDepositState,
  setDepositState,
  hasPendingDeposit,
};
