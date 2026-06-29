const { supabase } = require('../../../backend/config/supabase');
const { getDisplayName } = require('./displayName');

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

function pad(value) {
  return String(value).padStart(2, '0');
}

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateString(date = new Date()) {
  const parts = bangkokParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTimeString(date = new Date()) {
  const parts = bangkokParts(date);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseDateFromText(text, fallbackDate = new Date()) {
  const raw = String(text || '');
  const iso = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }

  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slash) {
    const fallbackParts = bangkokParts(fallbackDate);
    let year = slash[3] ? Number(slash[3]) : Number(fallbackParts.year);
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

function calculateLateMinutes(clockIn, shiftStart) {
  const clockInMinutes = minutesOf(clockIn);
  const shiftStartMinutes = minutesOf(shiftStart);
  if (!Number.isFinite(clockInMinutes) || !Number.isFinite(shiftStartMinutes)) return 0;
  return Math.max(0, clockInMinutes - shiftStartMinutes);
}

function calculateClosedEarlyMinutes(clockOut, shiftEnd) {
  const clockOutMinutes = minutesOf(clockOut);
  const shiftEndMinutes = minutesOf(shiftEnd);
  if (!Number.isFinite(clockOutMinutes) || !Number.isFinite(shiftEndMinutes)) return 0;
  return Math.max(0, shiftEndMinutes - clockOutMinutes);
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
  const alertKey = `${alertType}:${workDate}:${branchId}:${employeeId}`;

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

  const claimed = await claimAttendanceAlert(alertKey, {
    alertType,
    employeeId,
    branchId,
    workDate,
    title,
    severity,
  });
  if (!claimed) {
    const { data: claimedExisting } = await supabase
      .from('attendance_alerts')
      .select('id')
      .eq('alert_type', alertType)
      .eq('employee_id', employeeId)
      .eq('branch_id', branchId)
      .eq('work_date', workDate)
      .limit(1)
      .maybeSingle();
    return claimedExisting || null;
  }

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

async function claimAttendanceAlert(alertKey, payload) {
  const now = new Date().toISOString();
  const { data: claim, error: claimError } = await supabase
    .from('system_audit_logs')
    .insert([{
      user_name: 'line_bot',
      action: 'attendance_alert_claim',
      table_name: 'attendance_alerts',
      record_id: alertKey,
      source: 'line',
      description: `${payload.alertType} attendance alert claim`,
      new_value: {
        alert_key: alertKey,
        ...payload,
        claimed_at: now,
      },
      module: 'line',
      branch_id: payload.branchId || null,
      actor_type: 'system',
      actor_id: 'line_bot',
      created_at: now,
    }])
    .select('id')
    .single();

  if (claimError || !claim) {
    console.warn('Attendance alert claim failed:', claimError && (claimError.message || claimError), { alertKey });
    return true;
  }

  const { data: firstClaim, error: firstClaimError } = await supabase
    .from('system_audit_logs')
    .select('id')
    .eq('action', 'attendance_alert_claim')
    .eq('table_name', 'attendance_alerts')
    .eq('record_id', alertKey)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstClaimError) {
    console.warn('Attendance alert claim check failed:', firstClaimError.message || firstClaimError, { alertKey });
    return true;
  }

  return firstClaim && String(firstClaim.id) === String(claim.id);
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

    const name = getDisplayName(schedule.employees, `พนักงาน ${schedule.employee_id}`);

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
  calculateLateMinutes,
  calculateClosedEarlyMinutes,
  getBranchScheduleWindow,
  ensureAttendanceAlert,
  createAbsenceAlertsForBranchDay,
};
