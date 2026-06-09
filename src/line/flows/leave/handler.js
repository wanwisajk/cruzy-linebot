const leaveFlex = require('../../flex/leaveFlex');
const { replyOrPush } = require('../../reply');
const { createLeave } = require('./service');
const { logEvent } = require('../../utils/audit');
const employeeRepo = require('../../../../backend/repositories/employee.repo');

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  // Basic parse: expect lines like "ขอลา\nประเภท: ลากิจ\nจาก: 2026-06-10\nถึง: 2026-06-12\nเหตุผล: ..."
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const typeLine = lines.find((l) => /ประเภท|type/i.test(l)) || 'ลากิจ';
  const fromLine = lines.find((l) => /จาก|start/i.test(l));
  const toLine = lines.find((l) => /ถึง|end/i.test(l));
  const reasonLine = lines.find((l) => /เหตุผล|reason/i.test(l));

  const type = typeLine.split(/[:\s]/).slice(-1)[0] || 'ลากิจ';
  const startDate = fromLine ? fromLine.split(/[:\s]/).slice(-1)[0] : null;
  const endDate = toLine ? toLine.split(/[:\s]/).slice(-1)[0] : null;
  const reason = reasonLine ? reasonLine.split(/[:\s]/).slice(1).join(' ') : '';

  const source = event.source || {};
  const lineUserId = source.userId || null;
  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;

  const created = await createLeave({
    employeeId: employee ? employee.id : null,
    type,
    startDate: startDate || new Date().toISOString().slice(0,10),
    endDate: endDate || startDate || new Date().toISOString().slice(0,10),
    reason,
  });

  // prepare postback payloads for manager
  const approveData = `leave_action|${created.id}|approve`;
  const rejectData = `leave_action|${created.id}|reject`;

  const flex = leaveFlex({ id: created.id, type, from: created.start_date, to: created.end_date, reason: created.reason, approveData, rejectData });

  // send to employee as reply
  await replyOrPush({ replyToken: event.replyToken, messages: [flex] });
  await logEvent('leave_requested_sent', { leaveId: created.id, actor: employee ? employee.id : null });
}

module.exports = { handle };
