const { supabase } = require('../../../../backend/config/supabase');
const leaveFlex = require('../../flex/leaveFlex');
const { replyOrPush } = require('../../reply');
const { createLeave, uploadLeaveAttachment } = require('./service');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText } = require('../../utils/attendance');
const { getDisplayName } = require('../../utils/displayName');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
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

function isPrivateEvent(event) {
  const source = event.source || {};
  return !!source.userId && !source.groupId && !source.roomId;
}

function eventIso(event) {
  return event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
}

function employeeDisplayName(employee) {
  return getDisplayName(employee);
}

function parseTargetEmployeeId(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/(?:พนักงาน|employee|emp)\s*#?\s*(\d+)/i) || raw.match(/^(?:ลา|ขอลา)\s+#?\s*(\d+)\b/i);
  return match ? match[1] : null;
}

async function resolveLeaveEmployee(actor, text) {
  const targetEmployeeId = parseTargetEmployeeId(text);
  if (targetEmployeeId) {
    const employee = await employeeRepo.findById(targetEmployeeId);
    return {
      employee,
      missingTarget: !employee,
      targetEmployeeId,
      requestedByUser: Boolean(actor && actor.user),
    };
  }

  if (actor && actor.employee) {
    return {
      employee: actor.employee,
      missingTarget: false,
      targetEmployeeId: null,
      requestedByUser: Boolean(actor.user && actor.employeeResolvedBy === 'user_identity'),
    };
  }

  return {
    employee: null,
    missingTarget: Boolean(actor && actor.user),
    targetEmployeeId: null,
    requestedByUser: Boolean(actor && actor.user),
  };
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

  if (!isPrivateEvent(event)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'คำสั่งขอลาในส่วนตัวเท่านั้น',
      message: 'ขอลาใช้งานได้เฉพาะแชทส่วนตัวกับบอทเท่านั้น กรุณาพิมพ์ "ขอลา" ในแชทส่วนตัว',
      buttonLabel: 'ขอลา',
      buttonText: 'ขอลา',
      color: '#2563EB',
      altText: 'ขอลาในแชทส่วนตัวเท่านั้น',
    })] });
    return null;
  }

  if (lower === 'ยกเลิก') return cancelLeave(event);
  if (lower === 'เสร็จ' || lower === 'ข้าม') return finishAttachments(event, lower === 'ข้าม');
  if (lower === 'ยืนยันส่ง') return submitLeave(event);
  if (state && state.status === LEAVE_STATUS.AWAITING_DETAILS) return receiveDetails(event);
  if (LEAVE_TYPES.includes(text)) return selectLeaveType(event, text);
  if (/^(ลา|ขอลา)$/i.test(text)) return startLeave(event);

  return startLeave(event);
}

async function startLeave(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text.trim() : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getStateKey(event);
  if (!stateKey) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ไม่พบ LINE user id',
      message: 'ระบบไม่พบรหัส LINE ของคุณสำหรับการขอลา กรุณาลองใหม่ในแชทนี้หรือรีสตาร์ทบอท',
      buttonLabel: 'เริ่มใหม่',
      buttonText: 'ลา',
      color: '#B91C1C',
      altText: 'ไม่พบ LINE user id',
    })] });
    return null;
  }

  const actor = await resolveLineActor(lineUserId);
  if (!actor || !actor.type) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'กรุณาผูก LINE',
      message: 'หากต้องการขอลา กรุณาผูก LINE กับพนักงานด้วยคำสั่ง: พนักงาน <รหัสพนักงาน> หรือใช้บัญชีผู้ใช้งานระบบที่ลงทะเบียนแล้ว',
      buttonLabel: 'วิธีผูก',
      buttonText: 'พนักงาน <รหัสพนักงาน>',
      color: '#EA580C',
      altText: 'กรุณาผูก LINE',
    })] });
    return null;
  }

  const { employee, missingTarget, targetEmployeeId, requestedByUser } = await resolveLeaveEmployee(actor, text);
  if (!employee) {
    const message = targetEmployeeId
      ? `ไม่พบพนักงานหมายเลข ${targetEmployeeId} ในระบบ กรุณาตรวจสอบรหัสพนักงานตามข้อมูลในตาราง employees`
      : 'ยังจับคู่บัญชี LINE นี้กับพนักงานไม่ได้ กรุณาผูก LINE กับพนักงาน หรือกำหนด users.scope_type เป็น employee และ users.scope_value เป็นรหัสพนักงาน';

    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: missingTarget ? 'ยังไม่พบพนักงานของบัญชีนี้' : 'บัญชียังไม่ผูกพนักงาน',
      message,
      buttonLabel: 'วิธีผูก',
      buttonText: 'พนักงาน <รหัสพนักงาน>',
      color: '#B91C1C',
      altText: 'ยังไม่พบพนักงานของบัญชีนี้',
    })] });
    return null;
  }

  const actingAsUser = requestedByUser && actor.user;
  const actorType = actingAsUser ? 'user' : actor.type;
  const actorId = actingAsUser ? actor.user.id : actor.id;
  const actorName = getDisplayName(actingAsUser ? actor.user : null, actor.employee, actor.name, lineUserId);

  setLeaveState(stateKey, {
    status: LEAVE_STATUS.AWAITING_TYPE,
    employeeId: employee.id,
    employeeName: employeeDisplayName(employee),
    actorType,
    actorId,
    actorName,
    requestedByUser,
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
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ไม่พบสาขา',
      message: 'ยังหาสาขาของคำขอลาไม่ได้ กรุณาพิมพ์สาขาเพิ่มในข้อความ เช่น สาขา: CCA หรืออัปเดตตารางงาน/สาขา preferred ในระบบ',
      buttonLabel: 'ตัวอย่างข้อความ',
      buttonText: 'วันที่เริ่มลา: 13/06/2026\nวันที่สิ้นสุด: 14/06/2026\nเหตุผล: ...',
      color: '#EA580C',
      altText: 'ไม่พบสาขา',
    })] });
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
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ไฟล์ไม่ถูกต้อง',
      message: 'รองรับเฉพาะรูปภาพหรือไฟล์ PDF สำหรับเอกสารแนบ กรุณาแปลงเป็น PDF หรือส่งรูปภาพ',
      buttonLabel: 'ตัวอย่างไฟล์',
      buttonText: 'ส่งไฟล์.pdf',
      color: '#EA580C',
      altText: 'ไฟล์ไม่รองรับ',
    })] });
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
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveTypeFlex()] });
    return null;
  }

  const attachments = state.attachments || [];
  if (!skipped && attachments.length === 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveAttachmentPromptFlex({ type: state.leaveType })] });
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
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.leaveTypeFlex()] });
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
    actorType: state.actorType,
    actorId: state.actorId,
    actorName: state.actorName,
  });

  const uploaded = [];
  for (const attachment of state.attachments || []) {
    try {
      uploaded.push(await uploadLeaveAttachment({ leaveId: created.id, message: attachment }));
    } catch (err) {
      console.warn('Leave attachment upload failed:', attachment.id, err.message || err);
    }
  }

  await logEvent('leave_requested_sent', {
    leaveId: created.id,
    branch_id: state.branchId,
    actor: state.employeeId,
    attachment_count: uploaded.length || (state.attachments || []).length,
  });

  setLeaveState(stateKey, null);
  return true;
}

async function cancelLeave(event) {
  const stateKey = getStateKey(event);
  if (stateKey) setLeaveState(stateKey, null);
  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
    title: 'ยกเลิกคำขอ',
    message: 'ยกเลิกคำขอลาแล้ว',
    buttonLabel: 'เริ่มใหม่',
    buttonText: 'ลา',
    color: '#6B7280',
    altText: 'ยกเลิกคำขอ',
  })] });
  return true;
}

module.exports = {
  handle,
  handleAttachmentMessage,
};
