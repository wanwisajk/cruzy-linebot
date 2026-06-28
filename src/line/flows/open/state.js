const openStates = new Map();
const recentImages = new Map();
const reminderTimers = new Map();
const processedCompletionKeys = new Map();

const OPEN_STATUS = {
  AWAITING_IMAGE: 'awaiting_image',
};

const IMAGE_WINDOW_MS = 10000;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getOpenStateKey(source = {}) {
  const chatKey = source.groupId || source.roomId || source.userId || 'unknown';
  const senderKey = source.userId || 'unknown';
  return `${chatKey}:${senderKey}`;
}

function getOpenState(key) {
  return openStates.get(key) || null;
}

function setOpenState(key, state) {
  if (!state) {
    clearOpenState(key);
    return;
  }

  openStates.set(key, { ...state, updated_at: Date.now() });
}

function updateOpenState(key, updates) {
  const current = openStates.get(key) || {};
  const next = { ...current, ...updates, updated_at: Date.now() };
  openStates.set(key, next);
  return next;
}

function clearOpenState(key) {
  openStates.delete(key);
  clearReminderTimer(key);
}

function hasOpenState(key) {
  return Boolean(openStates.get(key));
}

function setRecentOpenImage(key, image) {
  recentImages.set(key, { ...image, updated_at: Date.now() });
}

function consumeRecentOpenImage(key, maxAgeMs = IMAGE_WINDOW_MS) {
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

function markOpenCompletionProcessed(key) {
  if (!key) return false;
  if (processedCompletionKeys.has(key)) return false;
  processedCompletionKeys.set(key, Date.now());
  return true;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [key, state] of openStates.entries()) {
    if (now - state.updated_at > STATE_MAX_AGE_MS) {
      clearOpenState(key);
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
  OPEN_STATUS,
  IMAGE_WINDOW_MS,
  getOpenStateKey,
  getOpenState,
  setOpenState,
  updateOpenState,
  clearOpenState,
  hasOpenState,
  setRecentOpenImage,
  consumeRecentOpenImage,
  markOpenCompletionProcessed,
  setReminderTimer,
  clearReminderTimer,
};
