const employeeRepo = require('../../../../backend/repositories/employee.repo');
const { logEvent } = require('../../utils/audit');
const { replyOrPush } = require('../../reply');

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  const match = text.trim().match(/^(?:พนักงาน|register)\s+(\S{1,255})$/i);
  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: พนักงาน <รหัสพนักงาน> เช่น พนักงาน EMP001' }] });
    return;
  }

  const employeeId = match[1].trim();

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE userId ครับ' }] });
    return;
  }

  // Check employee exists
  const employee = await employeeRepo.findById(employeeId);
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบพนักงานรหัส ${employeeId}` }] });
    return;
  }

  // Check if already linked to different account
  if (employee.line_user_id && employee.line_user_id !== lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `พนักงานรหัส ${employeeId} ผูกกับ LINE account อื่นแล้ว` }] });
    return;
  }

  // Check if this LINE account is linked to different employee
  const existingEmployee = await employeeRepo.findByLineUserId(lineUserId);
  if (existingEmployee && String(existingEmployee.id) !== String(employeeId)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'LINE ของคุณเชื่อมกับพนักงานคนอื่นแล้ว' }] });
    return;
  }

  // Update
  try {
    await employeeRepo.updateLineUserId(employeeId, lineUserId);
    await logEvent('employee_registered', { employee_id: employeeId, line_user_id: lineUserId });
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `ผูก LINE สำเร็จ\nชื่อ: ${employee.name}\nรหัส: ${employeeId}` }],
    });
  } catch (err) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }] });
  }
}

module.exports = { handle };
