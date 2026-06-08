const { supabase } = require('../config/supabase');
const { todayBangkok, addDaysBangkok } = require('../utils/date');

async function findByEmployeeAndDate(employeeId, workDate) {
  const { data, error } = await supabase
    .from('schedules')
    .select('id,work_date,shift_start,shift_end,status,note,is_off,branches(id,name,code)')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .order('shift_start', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findUpcomingByEmployee(employeeId, days = 7) {
  const start = todayBangkok();
  const end = addDaysBangkok(days - 1);

  const { data, error } = await supabase
    .from('schedules')
    .select('id,work_date,shift_start,shift_end,status,note,is_off,branches(id,name,code)')
    .eq('employee_id', employeeId)
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: true })
    .order('shift_start', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = {
  findByEmployeeAndDate,
  findUpcomingByEmployee,
};
