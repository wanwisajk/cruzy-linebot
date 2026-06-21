const { parseOpenEvent } = require('./parser');
const { recordOpen } = require('./service');
const openFlex = require('../../flex/openFlex');
const { replyOrPush } = require('../../reply');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');
const { buildLineAudit } = require('../../utils/lineAudit');
const {
  getBranchScheduleWindow,
  ensureAttendanceAlert,
  minutesOf,
  parseDateFromText,
  parseTimeFromText,
} = require('../../utils/attendance');
const {
  OPEN_STATUS,
  IMAGE_WINDOW_MS,
  getOpenStateKey,
  getOpenState,
  setOpenState,
  updateOpenState,
  clearOpenState,
  hasOpenState,
  setRecentOpenImage,
  consumeRecentOpenImage,
  setReminderTimer,
  clearReminderTimer,
} = require('./state');

const MISSING_IMAGE_TEXT = 'กรุณาแนบรูปหน้าร้านที่เปิดเรียบร้อยแล้ว';

function getReplyTarget(source = {}) {
  return source.groupId || source.roomId || source.userId || null;
}

function scheduleMissingImageReminder(stateKey, target) {
  if (!target) return;

  const timer = setTimeout(async () => {
    const state = getOpenState(stateKey);
    if (!state || state.status !== OPEN_STATUS.AWAITING_IMAGE || state.reminderSent) return;

    updateOpenState(stateKey, { reminderSent: true });

    try {
      await replyOrPush({
        to: target,
        messages: [{ type: 'text', text: MISSING_IMAGE_TEXT }],
      });
    } catch (err) {
      console.warn('Unable to send opening image reminder:', err.message || err);
    }
  }, IMAGE_WINDOW_MS);

  setReminderTimer(stateKey, timer);
}

async function handle(event) {
  const parsed = parseOpenEvent(event);
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getOpenStateKey(source);

  const actor = lineUserId ? await resolveLineActor(lineUserId) : null;
  const employee = actor && actor.employee ? actor.employee : null;
  if (!employee) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยังไม่พบพนักงานของผู้เปิดร้าน กรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน>' }],
    });
    return null;
  }

  const employeeName = getDisplayName(employee, actor && actor.user, actor && actor.name, lineUserId);
  const audit = buildLineAudit({ lineUserId, lineGroupId: source.groupId || source.roomId || null, actor });
  const eventTime = event.timestamp ? new Date(event.timestamp) : new Date();
  const workDate = parseDateFromText(parsed.text, eventTime);
  const { branch, lineGroupId } = await resolveBranchFromEvent(event, parsed.text, {
    employeeId: employee ? employee.id : null,
    workDate,
  });

  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: #สาขา <ตัวย่อสาขา> เช่น #สาขา CCA หรือพิมพ์เช่น #เปิดร้าน CCA 09:00' }] });
    return null;
  }

  const clockIn = parseTimeFromText(parsed.text, eventTime);
  const schedule = await getBranchScheduleWindow({
    employeeId: employee ? employee.id : null,
    branchId: branch ? branch.id : null,
    workDate,
  });
  const lateBy = Math.max(0, minutesOf(clockIn) - minutesOf(schedule.shiftStart));
  const pendingImage = consumeRecentOpenImage(stateKey);
  const openState = {
    status: OPEN_STATUS.AWAITING_IMAGE,
    employeeId: employee ? employee.id : null,
    employeeName,
    branchId: branch ? branch.id : null,
    branchCode: branch.code,
    branchName: branch.name,
    lineGroupId,
    lineUserId,
    messageText: parsed.text,
    messageId: parsed.messageId,
    submittedAt: eventTime.toISOString(),
    eventTimestamp: eventTime.toISOString(),
    workDate,
    clockIn,
    expectedTime: schedule.shiftStart,
    lateBy,
    target: getReplyTarget(source),
    auditActorType: audit.auditActorType,
    auditActorId: audit.auditActorId,
    auditActorName: audit.auditActorName,
  };

  if (pendingImage && pendingImage.messageId) {
    return completeOpen({
      event,
      stateKey,
      state: openState,
      imageMessageId: pendingImage.messageId,
      imageReceivedAt: pendingImage.receivedAt,
    });
  }

  setOpenState(stateKey, openState);
  scheduleMissingImageReminder(stateKey, openState.target);
  return null;
}

async function completeOpen({ event, stateKey, state, imageMessageId, imageReceivedAt }) {
  clearReminderTimer(stateKey);

  const record = await recordOpen({
    employeeId: state.employeeId,
    branchId: state.branchId,
    messageId: state.messageId,
    imageMessageId,
    hasImage: true,
    workDate: state.workDate,
    clockIn: state.clockIn,
    lateBy: state.lateBy,
    source: 'line',
    lineGroupId: state.lineGroupId,
    lineUserId: state.lineUserId,
    messageText: state.messageText,
    submittedAt: state.submittedAt,
    timestamp: state.eventTimestamp,
    rawText: state.messageText,
    auditActorType: state.auditActorType,
    auditActorId: state.auditActorId,
    auditActorName: state.auditActorName,
  });

  if (state.lateBy > 0 && state.employeeId && state.branchId) {
    await ensureAttendanceAlert({
      alertType: 'late',
      employeeId: state.employeeId,
      branchId: state.branchId,
      workDate: state.workDate,
      title: 'มาสาย',
      detail: `${state.employeeName} เปิดร้านเวลา ${state.clockIn.slice(0, 5)} สาย ${state.lateBy} นาที (เวลาเข้างาน ${state.expectedTime.slice(0, 5)})`,
      severity: 'warning',
      alertTime: state.clockIn,
    });
  }

  const flex = openFlex({
    branch: state.branchCode,
    branchName: state.branchName,
    employee: state.employeeName,
    time: `${state.workDate} ${state.clockIn.slice(0, 5)}`,
    expectedTime: state.expectedTime,
    lateBy: state.lateBy,
    messageId: imageMessageId,
    messageText: state.messageText,
    photoCount: 1,
    imageReceivedAt,
    attachmentUrl: record.attachment_url,
  });

  await replyOrPush({ replyToken: event.replyToken, to: null, messages: [flex] });
  clearOpenState(stateKey);

  return record;
}

async function handleImageMessage(event) {
  const source = event.source || {};
  const stateKey = getOpenStateKey(source);
  const messageId = event.message && event.message.id;

  if (!messageId) return false;

  const state = getOpenState(stateKey);
  if (!state || state.status !== OPEN_STATUS.AWAITING_IMAGE) {
    setRecentOpenImage(stateKey, {
      messageId,
      receivedAt: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    });
    return false;
  }

  await completeOpen({
    event,
    stateKey,
    state,
    imageMessageId: messageId,
    imageReceivedAt: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
  });
  return true;
}

function hasActiveOpenImageRequest(event) {
  return hasOpenState(getOpenStateKey(event.source || {}));
}

async function handleActiveTextMessage(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const lower = String(text || '').trim().toLowerCase();
  const stateKey = getOpenStateKey(event.source || {});
  const state = stateKey ? getOpenState(stateKey) : null;
  if (!state || state.status !== OPEN_STATUS.AWAITING_IMAGE) return false;

  if (lower === 'ยกเลิก') {
    clearOpenState(stateKey);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยกเลิกคำสั่งเปิดร้านแล้วครับ' }],
    });
    return true;
  }

  if (lower.includes('แก้ไข')) {
    clearOpenState(stateKey);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'เริ่มเปิดร้านใหม่ได้เลยครับ พิมพ์ “#เปิดร้าน” พร้อมเวลาใหม่ แล้วส่งรูปหน้าร้านอีกครั้ง' }],
    });
    return true;
  }

  return false;
}

module.exports = {
  handle,
  handleImageMessage,
  handleActiveTextMessage,
  hasActiveOpenImageRequest,
};
