const { supabase } = require('../../../../backend/config/supabase');

async function recordOpen({ employeeId, branchId, messageId, hasImage, timestamp, rawText }) {
  // Insert into shop_openings table (if exists) and write audit
  const record = {
    employee_id: employeeId || null,
    branch_id: branchId || null,
    message_id: messageId || null,
    has_image: hasImage ? true : false,
    raw_text: rawText || null,
    opened_at: timestamp || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  try {
    await supabase.from('shop_openings').insert([record]);
  } catch (err) {
    // ignore DB errors here — audit should capture
  }

  // Also insert an audit log
  try {
    await supabase.from('audit_logs').insert([
      { event_type: 'open_shop', payload: record, created_at: new Date().toISOString() },
    ]);
  } catch (e) {
    // ignore
  }

  return record;
}

module.exports = {
  recordOpen,
};
