// In-memory store for sales flow state (temporary; can migrate to Redis/DB later)
const flowStates = new Map();

const FLOW_STATES = {
  AWAITING_TEXT: 'awaiting_text',
  TEXT_RECEIVED: 'text_received',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  AWAITING_IMAGES: 'awaiting_images',
  AWAITING_FINAL_CONFIRMATION: 'awaiting_final_confirmation',
  IMAGES_COMPLETE: 'images_complete',
  CONFIRMED_DRAFT: 'confirmed_draft',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
// Key: userId (for tracking per user; one active flow per user at a time)
function getFlowState(userId) {
  return flowStates.get(userId) || null;
}

function setFlowState(userId, state) {
  if (!state) {
    flowStates.delete(userId);
    return;
  }
  flowStates.set(userId, { ...state, updated_at: Date.now() });
}

function updateFlowState(userId, updates) {
  const key = userId;
  const existing = flowStates.get(key) || {};
  flowStates.set(key, { ...existing, ...updates, updated_at: Date.now() });
  return flowStates.get(key);
}

function appendFlowImage(userId, image) {
  const existing = flowStates.get(userId);
  if (!existing) return null;

  const messageId = image && image.message_id;
  const currentImages = Array.isArray(existing.images) ? existing.images : [];
  const images = messageId && currentImages.some((item) => item && item.message_id === messageId)
    ? currentImages
    : [...currentImages, image];

  const next = { ...existing, images, updated_at: Date.now() };
  flowStates.set(userId, next);
  return next;
}

// Cleanup old states (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 3600000; // 1 hour
  for (const [key, state] of flowStates.entries()) {
    if (now - state.updated_at > MAX_AGE) {
      flowStates.delete(key);
    }
  }
}, 60000); // every minute

module.exports = {
  FLOW_STATES,
  getFlowState,
  setFlowState,
  updateFlowState,
  appendFlowImage,
};
