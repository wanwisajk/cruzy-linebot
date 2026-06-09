const { parseOpenEvent } = require('./parser');
const { recordOpen } = require('./service');
const openFlex = require('../../flex/openFlex');
const { replyOrPush } = require('../../reply');
const employeeRepo = require('../../../../backend/repositories/employee.repo');

async function handle(event) {
  const parsed = parseOpenEvent(event);
  const source = event.source || {};
  const lineUserId = source.userId || source.userId || (source.userId === undefined ? source.userId : null);

  // best-effort: find employee by Line user id
  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;
  const employeeName = employee ? employee.name : null;

  // compute late: simple threshold at 09:00 local time
  const ts = new Date();
  const nowHour = ts.getHours();
  const nowMin = ts.getMinutes();
  const minutesSinceMidnight = nowHour * 60 + nowMin;
  const threshold = 9 * 60; // 09:00
  const lateBy = minutesSinceMidnight > threshold ? minutesSinceMidnight - threshold : 0;

  const record = await recordOpen({
    employeeId: employee ? employee.id : null,
    branchId: null,
    messageId: parsed.messageId,
    hasImage: parsed.hasImage,
    timestamp: ts.toISOString(),
    rawText: parsed.text,
  });

  const flex = openFlex({ branch: null, employee: employeeName, time: ts.toLocaleString('th-TH'), lateBy, messageId: parsed.messageId });

  // reply to user
  await replyOrPush({ replyToken: event.replyToken, to: null, messages: [flex] });

  return record;
}

module.exports = {
  handle,
};
