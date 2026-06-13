const leaveStates = new Map();

const LEAVE_STATUS = {
  AWAITING_TYPE: 'awaiting_type',
  AWAITING_DETAILS: 'awaiting_details',
  AWAITING_ATTACHMENTS: 'awaiting_attachments',
  READY_TO_SUBMIT: 'ready_to_submit',
};

function getLeaveState(userId) {
  return leaveStates.get(userId) || null;
}

function setLeaveState(userId, state) {
  if (!state) {
    leaveStates.delete(userId);
    return;
  }

  leaveStates.set(userId, { ...state, updated_at: Date.now() });
}

function updateLeaveState(userId, updates) {
  const existing = leaveStates.get(userId) || {};
  const next = { ...existing, ...updates, updated_at: Date.now() };
  leaveStates.set(userId, next);
  return next;
}

function hasLeaveState(userId) {
  return Boolean(getLeaveState(userId));
}

setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [key, state] of leaveStates.entries()) {
    if (now - state.updated_at > maxAge) {
      leaveStates.delete(key);
    }
  }
}, 60000);

module.exports = {
  LEAVE_STATUS,
  getLeaveState,
  setLeaveState,
  updateLeaveState,
  hasLeaveState,
};
