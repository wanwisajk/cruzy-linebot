const employeeRepo = require('../../../../backend/repositories/employee.repo');
const { lineClient } = require('../../../../backend/config/line');
const { logEvent } = require('../../utils/audit');
const { replyOrPush } = require('../../reply');

const pendingConfirmations = new Map();
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

function shortLineId(value) {
  const text = String(value || '');
  if (text.length <= 12) return text || '-';
  return `${text.slice(0, 6)}...${text.slice(-6)}`;
}

function isPrivateEvent(event) {
  const source = event.source || {};
  return Boolean(source.userId) && !source.groupId && !source.roomId;
}

function isYes(text) {
  return /^(ใช่|ยืนยัน|ตกลง|ok|yes|y)$/i.test(String(text || '').trim());
}

function isNo(text) {
  return /^(ไม่|ไม่ใช่|ยกเลิก|cancel|no|n)$/i.test(String(text || '').trim());
}

function isRegisterCommand(text) {
  return /^#\s*(?:พนักงาน|register)\s+\S{1,255}$/i.test(String(text || '').trim());
}

function isExpired(pending) {
  return !pending || Date.now() - pending.createdAt > CONFIRMATION_TTL_MS;
}

async function getLineDisplayName(lineUserId) {
  if (!lineUserId) return null;

  try {
    const profile = await lineClient.getProfile(lineUserId);
    return profile && profile.displayName ? String(profile.displayName).trim() : null;
  } catch (err) {
    console.warn('Unable to fetch LINE profile for employee registration:', err.message || err);
    return null;
  }
}

function buildConfirmText({ employee, employeeId, lineDisplayName, lineUserId }) {
  const currentLineText = employee.line_user_id && employee.line_user_id !== lineUserId;

  return [
    'ยืนยันการผูก LINE กับพนักงาน',
    `ชื่อ LINE: ${lineDisplayName || shortLineId(lineUserId)}`,
    `พนักงาน: ${employee.name}${employee.nickname ? ` (${employee.nickname})` : ''}`,
    `รหัส: ${employeeId}`,
    '',
    'ถ้าถูกต้อง ตอบ: ใช่',
    'ถ้าไม่ถูกต้อง ตอบ: ไม่ใช่',
  ].filter((line) => line !== null && line !== undefined).join('\n');
}

async function bindEmployeeLine({ replyToken, employeeId, lineUserId }) {
  const employee = await employeeRepo.findById(employeeId);
  if (!employee) {
    await replyOrPush({ replyToken, messages: [{ type: 'text', text: `ไม่พบพนักงานรหัส ${employeeId}` }] });
    return;
  }

  const existingEmployee = await employeeRepo.findByLineUserId(lineUserId);
  const linkedToOtherEmployee = existingEmployee && String(existingEmployee.id) !== String(employeeId);

  if (employee.line_user_id === lineUserId && !linkedToOtherEmployee) {
    await replyOrPush({
      replyToken,
      messages: [{ type: 'text', text: `LINE นี้ผูกกับพนักงานอยู่แล้ว\nชื่อ: ${employee.name}\nรหัส: ${employeeId}` }],
    });
    return;
  }

  if (linkedToOtherEmployee) {
    await employeeRepo.clearLineUserId(existingEmployee.id);
  }

  await employeeRepo.updateLineUserId(employeeId, lineUserId);
  await logEvent('employee_registered', {
    employee_id: employeeId,
    line_user_id: lineUserId,
    previous_line_user_id: employee.line_user_id || null,
    unlinked_employee_id: linkedToOtherEmployee ? existingEmployee.id : null,
  });

  const updatedText = employee.line_user_id && employee.line_user_id !== lineUserId
    ? `อัปเดต LINE สำเร็จ\nชื่อ: ${employee.name}\nรหัส: ${employeeId}}`
    : `ผูก LINE สำเร็จ\nชื่อ: ${employee.name}\nรหัส: ${employeeId}`;
  const movedText = linkedToOtherEmployee
    ? `\n\nหมายเหตุ: LINE นี้เคยผูกกับ ${existingEmployee.name || existingEmployee.id} ระบบย้ายมาที่รหัสนี้แล้ว`
    : '';

  await replyOrPush({
    replyToken,
    messages: [{ type: 'text', text: `${updatedText}${movedText}` }],
  });
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  const match = text.trim().match(/^#\s*(?:พนักงาน|register)\s+(\S{1,255})$/i);
  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: #พนักงาน <รหัสพนักงาน> เช่น #พนักงาน EMP001' }] });
    return;
  }

  const employeeId = match[1].trim();
  pendingConfirmations.delete(lineUserId);

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE userId ครับ' }] });
    return;
  }

  if (!isPrivateEvent(event)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คำสั่งนี้ใช้ได้เฉพาะในแชทส่วนตัวกับบอทเท่านั้นครับ' }] });
    return;
  }

  const employee = await employeeRepo.findById(employeeId);
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบพนักงานรหัส ${employeeId}` }] });
    return;
  }

  const lineDisplayName = await getLineDisplayName(lineUserId);
  pendingConfirmations.set(lineUserId, {
    employeeId,
    createdAt: Date.now(),
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: buildConfirmText({ employee, employeeId, lineDisplayName, lineUserId }) }],
  });
}

async function handlePendingConfirmation(event) {
  if (!isPrivateEvent(event)) return false;

  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const lineUserId = event.source && event.source.userId;
  const pending = pendingConfirmations.get(lineUserId);
  if (!pending || isRegisterCommand(text)) return false;

  if (isExpired(pending)) {
    pendingConfirmations.delete(lineUserId);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'หมดเวลายืนยันแล้ว กรุณาพิมพ์ #พนักงาน <รหัสพนักงาน> ใหม่อีกครั้ง' }],
    });
    return true;
  }

  if (isNo(text)) {
    pendingConfirmations.delete(lineUserId);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยกเลิกการผูก LINE แล้วครับ' }],
    });
    return true;
  }

  if (!isYes(text)) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'กรุณาตอบ “ใช่” เพื่อผูก LINE หรือ “ไม่ใช่” เพื่อยกเลิก' }],
    });
    return true;
  }

  pendingConfirmations.delete(lineUserId);
  try {
    await bindEmployeeLine({
      replyToken: event.replyToken,
      employeeId: pending.employeeId,
      lineUserId,
    });
  } catch (err) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }],
    });
  }

  return true;
}

module.exports = {
  handle,
  handlePendingConfirmation,
};
