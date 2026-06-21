const { supabase } = require('../../../../backend/config/supabase');
const { lineClient } = require('../../../../backend/config/line');
const leaveFlex = require('../../flex/leaveFlex');
const { replyOrPush } = require('../../reply');
const {
  createLeave,
  uploadLeaveAttachment,
  fetchLeaveById,
  fetchLatestPendingLeaveForEmployee,
  fetchLatestLeaveForEmployee,
  countLeaveAttachments,
  findAreaApproversForLeave,
} = require('./service');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText } = require('../../utils/attendance');
const { getDisplayName } = require('../../utils/displayName');
const { buildLineAudit } = require('../../utils/lineAudit');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const {
  LEAVE_STATUS,
  getLeaveState,
  setLeaveState,
  updateLeaveState,
} = require('./state');

const LEAVE_TYPES = ['ลาป่วย', 'ลางาน', 'ลากิจ', 'ลาประจำปี'];
const LEGACY_LEAVE_TYPE_ALIASES = {
  'ลาพักร้อน': 'ลางาน',
};

function getStateKey(event) {
  return event.source && event.source.userId;
}

function isPrivateEvent(event) {
  const source = event.source || {};
  return !!source.userId && !source.groupId && !source.roomId;
}

function isLeaveStartCommand(text) {
  return /^#\s*(?:ขอลางาน|ขอลา|แจ้งลางาน)(?:\s|$)/i.test(String(text || '').trim());
}

function normalizeLeaveType(type) {
  const value = String(type || '').trim();
  return LEGACY_LEAVE_TYPE_ALIASES[value] || value;
}

function eventIso(event) {
  return event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
}

function employeeDisplayName(employee) {
  return getDisplayName(employee);
}

function leaveEmployeeName(leave) {
  return getDisplayName(leave && leave.employees, leave && leave.line_user_id);
}

function leaveBranchCode(leave) {
  return leave && leave.branches ? (leave.branches.code || leave.branches.name) : '-';
}

function parseTargetEmployeeId(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/(?:พนักงาน|employee|emp)\s*#?\s*(\d+)/i);
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
    return null;
  }

  if (lower === 'ยกเลิก') return cancelLeave(event);
  if (lower.includes('แก้ไข') && state) return editLeave(event);
  if (/^#?\s*(ติดตามสถานะ|เช็คสถานะ|ตรวจสถานะ|สถานะลา|ติดตามลา)$/i.test(text)) return trackLeaveStatus(event);
  if (lower === 'เสร็จ' || lower === 'ข้าม') return finishAttachments(event, lower === 'ข้าม');
  if (lower === 'ยืนยันส่ง') return submitLeave(event);
  if (state && state.status === LEAVE_STATUS.AWAITING_DETAILS) return receiveDetails(event);
  if (LEAVE_TYPES.includes(text) || LEGACY_LEAVE_TYPE_ALIASES[text]) return selectLeaveType(event, normalizeLeaveType(text));
  if (isLeaveStartCommand(text)) return startLeave(event);

  return null;
}

async function buildLeaveApprovalMessage(leave) {
  const attachmentCount = await countLeaveAttachments(leave.id);
  return leaveFlex.leaveApprovalFlex({
    id: leave.id,
    employeeName: leaveEmployeeName(leave),
    branchCode: leaveBranchCode(leave),
    type: leave.leave_type,
    from: leave.start_date,
    to: leave.end_date,
    reason: leave.reason,
    attachmentCount,
    approveData: `leave_action|${leave.id}|approve`,
    rejectData: `leave_action|${leave.id}|reject`,
  });
}

async function notifyLeaveApprovers(leave, options = {}) {
  if (!leave || leave.status !== 'pending') {
    return { sent: 0, approvers: [] };
  }

  const approvers = await findAreaApproversForLeave(leave);
  const message = await buildLeaveApprovalMessage(leave);
  let sent = 0;

  for (const approver of approvers) {
    if (!approver.line_user_id) continue;
    try {
      await lineClient.pushMessage({ to: approver.line_user_id, messages: [message] });
      sent += 1;
    } catch (err) {
      console.warn('Leave approval push failed:', err.message || err, {
        leaveId: leave.id,
        approverId: approver.id,
        lineUserId: approver.line_user_id,
      });
    }
  }

  await logEvent(options.action || 'leave_approval_requested', {
    leaveId: leave.id,
    approver_count: approvers.length,
    sent_count: sent,
  });

  return { sent, approvers };
}

async function trackLeaveStatus(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  if (!lineUserId || !isPrivateEvent(event)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'เช็คสถานะคำขอลาได้ในแชทส่วนตัวกับบอทเท่านั้น' }] });
    return true;
  }

  const actor = await resolveLineActor(lineUserId);
  if (!actor || !actor.employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ยังไม่พบพนักงาน',
      message: 'กรุณาผูก LINE กับพนักงานก่อนเช็คสถานะคำขอลา',
      buttonLabel: 'วิธีผูก',
      buttonText: '#พนักงาน <รหัสพนักงาน>',
      color: '#B91C1C',
      altText: 'ยังไม่พบพนักงาน',
    })] });
    return true;
  }

  const pendingLeave = await fetchLatestPendingLeaveForEmployee(actor.employee.id);
  const leave = pendingLeave || await fetchLatestLeaveForEmployee(actor.employee.id);
  if (!leave) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ไม่พบคำขอลา',
      message: 'ตอนนี้ยังไม่มีประวัติคำขอลา หากต้องการขอลางานใหม่ให้พิมพ์ "#ขอลางาน"',
      buttonLabel: 'ขอลางาน',
      buttonText: '#ขอลางาน',
      color: '#64748B',
      altText: 'ไม่พบคำขอลา',
    })] });
    return true;
  }

  const attachmentCount = await countLeaveAttachments(leave.id);
  if (leave.status !== 'pending') {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [leaveFlex.leaveResultFlex({
        id: leave.id,
        employeeName: leaveEmployeeName(leave),
        type: leave.leave_type,
        from: leave.start_date,
        to: leave.end_date,
        status: leave.status,
        approvedBy: getDisplayName({ name: leave.audit_actor_name }, { username: leave.decided_by }, leave.decided_by),
        attachmentCount,
      })],
    });
    return true;
  }

  const notified = await notifyLeaveApprovers(leave, { action: 'leave_approval_followed_up_from_status' });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: notified.sent > 0
          ? `ส่งแจ้งเตือนผู้อนุมัติอีกครั้งแล้ว ${notified.sent} คน`
          : 'ยังไม่พบผู้อนุมัติ area ที่ผูก LINE สำหรับสาขานี้',
      },
      leaveFlex.leaveStatusFlex({
        id: leave.id,
        employeeName: leaveEmployeeName(leave),
        branchCode: leaveBranchCode(leave),
        type: leave.leave_type,
        from: leave.start_date,
        to: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        attachmentCount,
        approverCount: notified.approvers.length,
      }),
    ],
  });
  return true;
}

async function startLeave(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text.trim() : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getStateKey(event);
  if (!stateKey) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'ไม่พบ LINE user id',
      message: 'ระบบไม่พบรหัส LINE ของคุณสำหรับการขอลางาน กรุณาลองใหม่ในแชทนี้หรือรีสตาร์ทบอท',
      buttonLabel: 'เริ่มใหม่',
      buttonText: '#ขอลางาน',
      color: '#B91C1C',
      altText: 'ไม่พบ LINE user id',
    })] });
    return null;
  }

  const actor = await resolveLineActor(lineUserId);
  if (!actor || !actor.type) {
    await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
      title: 'กรุณาผูก LINE',
      message: 'หากต้องการขอลางาน กรุณาผูก LINE กับพนักงานด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน> หรือใช้บัญชีผู้ใช้งานระบบที่ลงทะเบียนแล้ว',
      buttonLabel: 'วิธีผูก',
      buttonText: '#พนักงาน <รหัสพนักงาน>',
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
      buttonText: '#พนักงาน <รหัสพนักงาน>',
      color: '#B91C1C',
      altText: 'ยังไม่พบพนักงานของบัญชีนี้',
    })] });
    return null;
  }

  const audit = buildLineAudit({
    lineUserId,
    lineGroupId: source.groupId || source.roomId || null,
    actor,
  });
  const actorType = audit.auditActorType;
  const actorId = audit.auditActorId;
  const actorName = audit.auditActorName;

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

await replyOrPush({ 
  replyToken: event.replyToken, 
  messages: [
    { 
      type: 'text', 
      text: leaveFlex.leaveDetailPromptText({ type }) 
    }
  ] 
});  return true;
}

async function receiveDetails(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const stateKey = getStateKey(event);
  const state = stateKey ? getLeaveState(stateKey) : null;
  if (!state) return startLeave(event);

  const parsed = parseLeaveDetails(text);
  if (!parsed.startDate || !parsed.endDate || !parsed.reason) {
await replyOrPush({ 
  replyToken: event.replyToken, 
  messages: [
    { 
      type: 'text', 
      text: leaveFlex.leaveDetailPromptText({ type: state.leaveType }) 
    },
    {
      type: 'text',
      text:    `💡 คัดลอกข้อความตัวอย่างด้านบน แก้ไขข้อมูล แล้วพิมพ์ส่งกลับมาได้เลยครับ`
    }
  ] 
});    return null;
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

  const leave = await fetchLeaveById(created.id);
  const notified = await notifyLeaveApprovers(leave);
  setLeaveState(stateKey, null);
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      { type: 'text', text: 'บันทึกคำขอลาแล้ว ระบบจะส่งแจ้งเตือนผู้อนุมัติอัตโนมัติ' },
      leaveFlex.leaveStatusFlex({
        id: leave.id,
        employeeName: leaveEmployeeName(leave),
        branchCode: leaveBranchCode(leave),
        type: leave.leave_type,
        from: leave.start_date,
        to: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        attachmentCount: uploaded.length || (state.attachments || []).length,
        approverCount: notified.approvers.length,
      }),
    ],
  });
  return true;
}

async function cancelLeave(event) {
  const stateKey = getStateKey(event);
  if (stateKey) setLeaveState(stateKey, null);
  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
    title: 'ยกเลิกคำขอ',
    message: 'ยกเลิกคำขอลาแล้ว',
    buttonLabel: 'เริ่มใหม่',
    buttonText: '#ขอลางาน',
    color: '#6B7280',
    altText: 'ยกเลิกคำขอ',
  })] });
  return true;
}

async function editLeave(event) {
  const stateKey = getStateKey(event);
  if (stateKey) setLeaveState(stateKey, null);
  await replyOrPush({ replyToken: event.replyToken, messages: [leaveFlex.noticeFlex({
    title: 'พร้อมเริ่มคำขอลาใหม่',
    message: 'พิมพ์ “#ขอลางาน” ใหม่ แล้วกรอกข้อมูลหรือส่งเอกสารแนบอีกครั้ง',
    buttonLabel: 'เริ่มใหม่',
    buttonText: '#ขอลางาน',
    color: '#2563EB',
    altText: 'พร้อมเริ่มคำขอลาใหม่',
  })] });
  return true;
}

module.exports = {
  handle,
  handleAttachmentMessage,
  notifyLeaveApprovers,
};
