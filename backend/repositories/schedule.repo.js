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

async function findByEmployeeBetween(employeeId, startDate, endDate) {
  const { data, error } = await supabase
    .from('schedules')
    .select('id,branch_id,employee_id,work_date,shift_start,shift_end,status,note,is_off,branches(id,name,code)')
    .eq('employee_id', employeeId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true })
    .order('shift_start', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findByBranchBetween(branchId, startDate, endDate) {
  const { data, error } = await supabase
    .from('schedules')
    .select('id,branch_id,employee_id,work_date,shift_start,shift_end,status,note,is_off,employees(id,name,nickname),branches(id,name,code)')
    .eq('branch_id', branchId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true })
    .order('shift_start', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findActiveBetween(startDate, endDate, branchIds) {
  let query = supabase
    .from('schedules')
    .select('id,branch_id,employee_id,work_date,is_off')
    .eq('is_off', false)
    .gte('work_date', startDate)
    .lte('work_date', endDate);

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    query = query.in('branch_id', branchIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function findEligibleBranchesByEmployee(employeeId) {
  const { data, error } = await supabase
    .from('employee_branch_eligibility')
    .select('branch_id,branches(id,name,code,region_id,line_group_id,regions(name))')
    .eq('employee_id', employeeId)
    .eq('can_work', true)
    .order('is_preferred', { ascending: false })
    .order('priority', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => row.branches).filter(Boolean);
}

module.exports = {
  findByEmployeeAndDate,
  findUpcomingByEmployee,
  findByEmployeeBetween,
  findByBranchBetween,
  findActiveBetween,
  findEligibleBranchesByEmployee,
};
