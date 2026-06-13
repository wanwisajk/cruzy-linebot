const { supabase } = require('../../../backend/config/supabase');

function pad(value) {
  return String(value).padStart(2, '0');
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDateFromText(text, fallbackDate = new Date()) {
  const raw = String(text || '');
  const iso = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }

  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    return `${year}-${pad(slash[2])}-${pad(slash[1])}`;
  }

  return localDateString(fallbackDate);
}

function parseTimeFromText(text, fallbackDate = new Date()) {
  const match = String(text || '').match(/\b([01]?\d|2[0-3])[:.](\d{2})(?::(\d{2}))?\b/);
  if (match) {
    return `${pad(match[1])}:${pad(match[2])}:${pad(match[3] || '00')}`;
  }

  return localTimeString(fallbackDate);
}

function minutesOf(timeValue) {
  if (!timeValue) return null;
  const [hour, minute] = String(timeValue).split(':').map(Number);
  return hour * 60 + minute;
}

function dayOfWeek(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return date.getDay();
}

async function getBranchScheduleWindow({ employeeId, branchId, workDate }) {
  if (employeeId && branchId) {
    const { data: schedule } = await supabase
      .from('schedules')
      .select('shift_start,shift_end,is_off,status')
      .eq('employee_id', employeeId)
      .eq('branch_id', branchId)
      .eq('work_date', workDate)
      .eq('is_off', false)
      .order('shift_start', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (schedule && (schedule.shift_start || schedule.shift_end)) {
      return {
        shiftStart: schedule.shift_start || '09:00:00',
        shiftEnd: schedule.shift_end || '20:00:00',
        source: 'schedule',
      };
    }
  }

  if (branchId) {
    const { data: rule } = await supabase
      .from('branch_staffing_rules')
      .select('shift_start,shift_end')
      .eq('branch_id', branchId)
      .eq('day_of_week', dayOfWeek(workDate))
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (rule && (rule.shift_start || rule.shift_end)) {
      return {
        shiftStart: rule.shift_start || '09:00:00',
        shiftEnd: rule.shift_end || '20:00:00',
        source: 'branch_rule',
      };
    }
  }

  return { shiftStart: '09:00:00', shiftEnd: '20:00:00', source: 'default' };
}

async function ensureAttendanceAlert({ alertType, employeeId, branchId, workDate, title, detail, severity = 'warning', alertTime }) {
  if (!employeeId || !branchId || !workDate) return null;

  const { data: existing } = await supabase
    .from('attendance_alerts')
    .select('id')
    .eq('alert_type', alertType)
    .eq('employee_id', employeeId)
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('attendance_alerts')
    .insert([{
      alert_type: alertType,
      employee_id: employeeId,
      branch_id: branchId,
      work_date: workDate,
      title,
      detail,
      severity,
      alert_time: alertTime || null,
    }])
    .select('*')
    .single();

  if (error) {
    console.warn('Unable to create attendance alert:', error.message || error);
    return null;
  }

  return data;
}

async function createAbsenceAlertsForBranchDay({ branchId, workDate }) {
  if (!branchId || !workDate) return [];

  const { data: schedules, error } = await supabase
    .from('schedules')
    .select('employee_id,shift_start,shift_end,employees(name,nickname)')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .eq('is_off', false);

  if (error || !schedules) return [];

  const created = [];
  for (const schedule of schedules) {
    const { data: attendance } = await supabase
      .from('attendance')
      .select('id,clock_in')
      .eq('employee_id', schedule.employee_id)
      .eq('branch_id', branchId)
      .eq('work_date', workDate)
      .limit(1)
      .maybeSingle();

    if (attendance && attendance.clock_in) continue;

    const name = schedule.employees
      ? (schedule.employees.nickname || schedule.employees.name)
      : `พนักงาน ${schedule.employee_id}`;

    const alert = await ensureAttendanceAlert({
      alertType: 'absent',
      employeeId: schedule.employee_id,
      branchId,
      workDate,
      title: 'ขาดงาน',
      detail: `${name} ไม่มีเวลาเปิดร้าน/เข้างานในวันที่ ${workDate}`,
      severity: 'danger',
      alertTime: schedule.shift_start || null,
    });

    if (alert) created.push(alert);
  }

  return created;
}

module.exports = {
  localDateString,
  localTimeString,
  parseDateFromText,
  parseTimeFromText,
  minutesOf,
  getBranchScheduleWindow,
  ensureAttendanceAlert,
  createAbsenceAlertsForBranchDay,
};
