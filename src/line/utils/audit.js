const { supabase } = require('../../../backend/config/supabase');

async function logEvent(eventType, payload) {
  try {
    await supabase.from('system_audit_logs').insert([{ event_type: eventType, payload, created_at: new Date().toISOString() }]);
  } catch (err) {
    // swallow; auditing should not break main flow
    console.warn('Audit log failed', err.message || err);
  }
}

module.exports = { logEvent };
