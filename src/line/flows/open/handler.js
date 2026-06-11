const { parseOpenEvent } = require('./parser');
const { recordOpen } = require('./service');
const openFlex = require('../../flex/openFlex');
const { replyOrPush } = require('../../reply');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const branchRepo = require('../../../../backend/repositories/branch.repo');
const {
  getBranchScheduleWindow,
  ensureAttendanceAlert,
  minutesOf,
  parseDateFromText,
  parseTimeFromText,
} = require('../../utils/attendance');

async function handle(event) {
  const parsed = parseOpenEvent(event);
  const source = event.source || {};
  const lineUserId = source.userId || null;

  // best-effort: find employee by Line user id
  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;
  const employeeName = employee ? employee.name : null;
  const branchMatch = String(parsed.text || '').match(/\b([A-Z]{2,5})\b/i);
  const branchCode = branchMatch ? branchMatch[1].toUpperCase() : null;
  const branch = branchCode ? await branchRepo.findByCode(branchCode) : null;

  const eventTime = event.timestamp ? new Date(event.timestamp) : new Date();
  const workDate = parseDateFromText(parsed.text, eventTime);
  const clockIn = parseTimeFromText(parsed.text, eventTime);
  const schedule = await getBranchScheduleWindow({
    employeeId: employee ? employee.id : null,
    branchId: branch ? branch.id : null,
    workDate,
  });
  const lateBy = Math.max(0, minutesOf(clockIn) - minutesOf(schedule.shiftStart));

  const record = await recordOpen({
    employeeId: employee ? employee.id : null,
    branchId: branch ? branch.id : null,
    messageId: parsed.messageId,
    hasImage: parsed.hasImage,
    workDate,
    clockIn,
    lateBy,
    timestamp: eventTime.toISOString(),
    rawText: parsed.text,
  });

  if (lateBy > 0 && employee && branch) {
    await ensureAttendanceAlert({
      alertType: 'late',
      employeeId: employee.id,
      branchId: branch.id,
      workDate,
      title: 'มาสาย',
      detail: `${employee.nickname || employee.name} เปิดร้านเวลา ${clockIn.slice(0, 5)} สาย ${lateBy} นาที (เวลาเข้างาน ${schedule.shiftStart.slice(0, 5)})`,
      severity: 'warning',
      alertTime: clockIn,
    });
  }

  const flex = openFlex({
    branch: branch ? branch.code : branchCode,
    employee: employeeName,
    time: `${workDate} ${clockIn.slice(0, 5)}`,
    expectedTime: schedule.shiftStart,
    lateBy,
    messageId: parsed.messageId,
  });

  // reply to user
  await replyOrPush({ replyToken: event.replyToken, to: null, messages: [flex] });

  return record;
}

module.exports = {
  handle,
};
