const { supabase } = require('../../../../backend/config/supabase');
const leaveFlex = require('../../flex/leaveFlex');
const { replyOrPush } = require('../../reply');
const { createLeave, uploadLeaveAttachment } = require('./service');
const { logEvent } = require('../../utils/audit');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const userRepo = require('../../../../backend/repositories/user.repo');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText } = require('../../utils/attendance');
const {
  LEAVE_STATUS,
  getLeaveState,
  setLeaveState,
  updateLeaveState,
} = require('./state');

const LEAVE_TYPES = ['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาประจำปี'];

function getStateKey(event) {
  return event.source && event.source.userId;
}

function eventIso(event) {
  return event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
}

function employeeName(employee) {
  return employee ? (employee.nickname || employee.name) : '-';
}

function daysInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end - start) / 86400000) + 1;
  return Math.max(1, diff || 1);
}

function parseLeaveDetails(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const startLine = lines.find((line) => /^วันที่เริ่มลา/i.test(line) || /^(จาก|start|เริ่ม)/i.test(line));
  const endLine = lines.find((line) => /^วันที่สิ้นสุด/i.test(line) || /^(ถึง|end|สิ้นสุด)/i.test(line));
  const reasonLine = lines.find((line) => /^(เหตุผล|สาเหตุ|reason)/i.test(line));

  return {
    startDate: startLine ? parseDateFromText(startLine) : null,
    endDate: endLine ? parseDateFromText(endLine) : null,
    reason: reasonLine ? reasonLine.replace(/^(เหตุผล|สาเหตุ|reason)\s*[:：]?\s*/i, '').trim() : '',
  };
}

async function resolveLeaveBranch(event, text, employeeId, workDate) {
  const context = await resolveBranchFromEvent(event, text);
  if (context.branch) return context;

  if (employeeId && workDate) {
    const { data: schedule } = await supabase
      .from('schedules')
      .select('branches(id,name,code,line_group_id)')
      .eq('employee_id', employeeId)
      .eq('work_date', workDate)
      .eq('is_off', false)
      .limit(1)
      .maybeSingle();

    if (schedule && schedule.branches) {
      return { branch: schedule.branches, lineGroupId: schedule.branches.line_group_id || null, matchedBy: 'schedule' };
    }
  }

  if (employeeId) {
    const { data: preferred } = await supabase
      .from('employee_branch_eligibility')
      .select('branches(id,name,code,line_group_id)')
      .eq('employee_id', employeeId)
      .eq('can_work', true)
      .order('is_preferred', { ascending: false })
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (preferred && preferred.branches) {
      return { branch: preferred.branches, lineGroupId: preferred.branches.line_group_id || null, matchedBy: 'employee_branch_eligibility' };
    }
  }

  return context;
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text.trim() : '';
  const lower = text.toLowerCase();
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;

  if (lower === 'ยกเลิก') return cancelLeave(event);
  if (lower === 'เสร็จ' || lower === 'ข้าม') return finishAttachments(event, lower === 'ข้าม');
  if (lower === 'ยืนยันส่ง') return submitLeave(event);
  if (state && state.status === LEAVE_STATUS.AWAITING_DETAILS) return receiveDetails(event);
  if (LEAVE_TYPES.includes(text)) return selectLeaveType(event, text);
  if (/^(ลา|ขอลา)$/i.test(text)) return startLeave(event);

  return startLeave(event);
}

async function startLeave(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getStateKey(event);
  if (!stateKey) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE user id สำหรับขอลา' }] });
    return null;
  }

  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: พนักงาน <รหัสพนักงาน>' }] });
    return null;
  }

  setLeaveState(stateKey, {
    status: LEAVE_STATUS.AWAITING_TYPE,
    employeeId: employee.id,
    employeeName: employeeName(employee),
    lineUserId,
    lineGroupId: source.groupId || null,
    attachments: [],
    startedAt: eventIso(event),
  });

  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveTypeFlex()] });
  return true;
}

async function selectLeaveType(event, type) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state) return startLeave(event);

  updateLeaveState(stateKey, {
    status: LEAVE_STATUS.AWAITING_DETAILS,
    leaveType: type,
  });

  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveDetailPromptFlex({ type })] });
  return true;
}

async function receiveDetails(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state) return startLeave(event);

  const parsed = parseLeaveDetails(text);
  if (!parsed.startDate || !parsed.endDate || !parsed.reason) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveDetailPromptFlex({ type: state.leaveType })] });
    return null;
  }

  const { branch, lineGroupId } = await resolveLeaveBranch(event, text, state.employeeId, parsed.startDate);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังหาสาขาของคำขอลาไม่ได้ กรุณาพิมพ์สาขาเพิ่มในข้อความ เช่น สาขา: CCA หรือให้มีตารางงาน/สาขา preferred ในระบบ' }] });
    return null;
  }

  updateLeaveState(stateKey, {
    status: LEAVE_STATUS.AWAITING_ATTACHMENTS,
    branchId: branch.id,
    branchCode: branch.code,
    lineGroupId: lineGroupId || state.lineGroupId || branch.line_group_id || null,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    reason: parsed.reason,
    messageText: text,
    submittedAt: eventIso(event),
  });

  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveAttachmentPromptFlex({ type: state.leaveType })] });
  return true;
}

async function handleAttachmentMessage(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state || state.status !== LEAVE_STATUS.AWAITING_ATTACHMENTS) return false;

  const message = event.message;
  if (!message || (message.type !== 'image' && message.type !== 'file')) return false;

  const isPdf = message.type === 'file' && String(message.fileName || '').toLowerCase().endsWith('.pdf');
  if (message.type === 'file' && !isPdf) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'รองรับเฉพาะรูปภาพหรือไฟล์ PDF สำหรับเอกสารแนบ' }] });
    return true;
  }

  updateLeaveState(stateKey, {
    attachments: [...(state.attachments || []), {
      id: message.id,
      type: message.type,
      fileName: message.fileName || null,
    }],
  });

  // Keep chat quiet while collecting leave attachments.
  return true;
}

async function finishAttachments(event, skipped) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state || state.status !== LEAVE_STATUS.AWAITING_ATTACHMENTS) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีคำขอลาที่รอแนบไฟล์ พิมพ์ “ลา” เพื่อเริ่มใหม่' }] });
    return null;
  }

  const attachments = state.attachments || [];
  if (!skipped && attachments.length === 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีเอกสารแนบ หากไม่มีให้พิมพ์ “ข้าม”' }] });
    return null;
  }

  updateLeaveState(stateKey, { status: LEAVE_STATUS.READY_TO_SUBMIT });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [leaveFlex.leaveSummaryFlex({
      employeeName: state.employeeName,
      type: state.leaveType,
      from: state.startDate,
      to: state.endDate,
      reason: state.reason,
      attachmentCount: attachments.length,
    })],
  });
  return true;
}

async function submitLeave(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state || state.status !== LEAVE_STATUS.READY_TO_SUBMIT) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีสรุปคำขอลาให้ยืนยัน' }] });
    return null;
  }

  const created = await createLeave({
    employeeId: state.employeeId,
    branchId: state.branchId,
    type: state.leaveType,
    startDate: state.startDate,
    endDate: state.endDate,
    daysCount: daysInclusive(state.startDate, state.endDate),
    reason: state.reason,
    source: 'line',
    lineGroupId: state.lineGroupId,
    lineUserId: state.lineUserId,
    messageText: state.messageText,
    submittedAt: eventIso(event),
  });

  const uploaded = [];
  for (const attachment of state.attachments || []) {
    try {
      uploaded.push(await uploadLeaveAttachment({ leaveId: created.id, message: attachment }));
    } catch (err) {
      console.warn('Leave attachment upload failed:', attachment.id, err.message || err);
    }
  }

  const approveData = `leave_action|${created.id}|approve`;
  const rejectData = `leave_action|${created.id}|reject`;
  const approvalFlex = leaveFlex.leaveApprovalFlex({
    id: created.id,
    employeeName: state.employeeName,
    branchCode: state.branchCode,
    type: state.leaveType,
    from: state.startDate,
    to: state.endDate,
    reason: state.reason,
    attachmentCount: uploaded.length || (state.attachments || []).length,
    approveData,
    rejectData,
  });

  const targets = new Set();
  if (state.lineGroupId) targets.add(state.lineGroupId);
  const managers = await userRepo.findBranchManagers({ id: state.branchId, code: state.branchCode });
  for (const manager of managers) {
    if (manager.line_user_id) targets.add(manager.line_user_id);
  }

  for (const target of targets) {
    await replyOrPush({ to: target, messages: [approvalFlex] });
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: targets.size > 0 ? 'ส่งคำขอลาเพื่อรออนุมัติแล้ว' : 'บันทึกคำขอลาแล้ว แต่ยังไม่พบกลุ่มหรือ LINE ผู้จัดการสำหรับส่งอนุมัติ' }],
  });

  await logEvent('leave_requested_sent', {
    leaveId: created.id,
    branch_id: state.branchId,
    actor: state.employeeId,
    attachment_count: uploaded.length || (state.attachments || []).length,
    target_count: targets.size,
  });

  setLeaveState(stateKey, null);
  return true;
}

async function cancelLeave(event) {
  const stateKey = getStateKey(event);
  if (stateKey) setLeaveState(stateKey, null);
  await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยกเลิกคำขอลาแล้ว' }] });
  return true;
}

module.exports = {
  handle,
  handleAttachmentMessage,
};
