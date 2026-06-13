const inspectionStates = new Map();

const INSPECTION_STATUS = {
  COLLECTING_PHOTOS: 'collecting_photos',
  READY_TO_SUBMIT: 'ready_to_submit',
};

function getInspectionState(userId) {
  return inspectionStates.get(userId) || null;
}

function setInspectionState(userId, state) {
  if (!state) {
    inspectionStates.delete(userId);
    return;
  }

  inspectionStates.set(userId, { ...state, updated_at: Date.now() });
}

function updateInspectionState(userId, updates) {
  const existing = inspectionStates.get(userId) || {};
  const next = { ...existing, ...updates, updated_at: Date.now() };
  inspectionStates.set(userId, next);
  return next;
}

function hasInspectionState(userId) {
  return Boolean(getInspectionState(userId));
}

setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [key, state] of inspectionStates.entries()) {
    if (now - state.updated_at > maxAge) {
      inspectionStates.delete(key);
    }
  }
}, 60000);

module.exports = {
  INSPECTION_STATUS,
  getInspectionState,
  setInspectionState,
  updateInspectionState,
  hasInspectionState,
};
