const closeStates = new Map();
const recentImages = new Map();
const reminderTimers = new Map();
const processedCompletionKeys = new Map();

const CLOSE_STATUS = {
  AWAITING_IMAGE: 'awaiting_image',
};

const IMAGE_WINDOW_MS = 10000;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getCloseStateKey(source = {}) {
  const chatKey = source.groupId || source.roomId || source.userId || 'unknown';
  const senderKey = source.userId || 'unknown';
  return `${chatKey}:${senderKey}`;
}

function getCloseState(key) {
  return closeStates.get(key) || null;
}

function setCloseState(key, state) {
  if (!state) {
    clearCloseState(key);
    return;
  }

  closeStates.set(key, { ...state, updated_at: Date.now() });
}

function updateCloseState(key, updates) {
  const current = closeStates.get(key) || {};
  const next = { ...current, ...updates, updated_at: Date.now() };
  closeStates.set(key, next);
  return next;
}

function clearCloseState(key) {
  closeStates.delete(key);
  clearReminderTimer(key);
}

function hasCloseState(key) {
  return Boolean(closeStates.get(key));
}

function setRecentCloseImage(key, image) {
  recentImages.set(key, { ...image, updated_at: Date.now() });
}

function consumeRecentCloseImage(key, maxAgeMs = IMAGE_WINDOW_MS) {
  const image = recentImages.get(key);
  if (!image) return null;

  if (Date.now() - image.updated_at > maxAgeMs) {
    recentImages.delete(key);
    return null;
  }

  recentImages.delete(key);
  return image;
}

function setReminderTimer(key, timer) {
  clearReminderTimer(key);
  reminderTimers.set(key, timer);
}

function clearReminderTimer(key) {
  const timer = reminderTimers.get(key);
  if (timer) clearTimeout(timer);
  reminderTimers.delete(key);
}

function markCloseCompletionProcessed(key) {
  if (!key) return false;
  if (processedCompletionKeys.has(key)) return false;
  processedCompletionKeys.set(key, Date.now());
  return true;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [key, state] of closeStates.entries()) {
    if (now - state.updated_at > STATE_MAX_AGE_MS) {
      clearCloseState(key);
    }
  }

  for (const [key, image] of recentImages.entries()) {
    if (now - image.updated_at > IMAGE_WINDOW_MS) {
      recentImages.delete(key);
    }
  }

  for (const [key, timestamp] of processedCompletionKeys.entries()) {
    if (now - timestamp > STATE_MAX_AGE_MS) {
      processedCompletionKeys.delete(key);
    }
  }
}, 60000);
if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = {
  CLOSE_STATUS,
  IMAGE_WINDOW_MS,
  getCloseStateKey,
  getCloseState,
  setCloseState,
  updateCloseState,
  clearCloseState,
  hasCloseState,
  setRecentCloseImage,
  consumeRecentCloseImage,
  markCloseCompletionProcessed,
  setReminderTimer,
  clearReminderTimer,
};
