const { supabase } = require('../../../../backend/config/supabase');

async function recordOpen({ employeeId, branchId, messageId, hasImage, timestamp, rawText, workDate, clockIn, lateBy }) {
  const record = {
    employee_id: employeeId || null,
    branch_id: branchId || null,
    message_id: messageId || null,
    has_image: hasImage ? true : false,
    raw_text: rawText || null,
    opened_at: timestamp || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (employeeId && branchId) {
    try {
      await supabase.from('attendance').insert([{
        employee_id: employeeId,
        branch_id: branchId,
        work_date: workDate,
        clock_in: clockIn,
        late_minutes: lateBy || 0,
      }]);
    } catch (err) {
      console.warn('Unable to record opening attendance:', err.message || err);
    }
  }

  try {
    await supabase.from('system_audit_logs').insert([{
      user_name: 'line_bot',
      action: 'open_shop',
      table_name: 'attendance',
      record_id: employeeId ? String(employeeId) : null,
      source: 'line',
      description: rawText || 'เปิดร้าน',
      new_value: record,
      branch_id: branchId || null,
      actor_type: 'line',
      actor_id: employeeId ? String(employeeId) : null,
    }]);
  } catch (e) {
    // ignore
  }

  return record;
}

module.exports = {
  recordOpen,
};
