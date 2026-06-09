const { supabase } = require('../../../../backend/config/supabase');
const { logEvent } = require('../../utils/audit');

async function createLeave({ employeeId, type, startDate, endDate, reason }) {
  const payload = {
    employee_id: employeeId,
    leave_type: type,
    start_date: startDate,
    end_date: endDate,
    reason: reason || null,
  };

  const { data, error } = await supabase.from('leaves').insert([payload]).select().single();
  if (error) throw error;

  await logEvent('leave_created', { leave: data, actor: employeeId });
  return data;
}

async function updateLeaveStatus(leaveId, status, actor) {
  const { data, error } = await supabase.from('leaves').update({ status }).eq('id', leaveId).select().single();
  if (error) throw error;

  await logEvent('leave_status_updated', { leaveId, status, actor });
  return data;
}

module.exports = { createLeave, updateLeaveStatus };
