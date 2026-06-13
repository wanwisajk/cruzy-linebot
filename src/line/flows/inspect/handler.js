const {
  INSPECTION_STATUS,
  getInspectionState,
  setInspectionState,
  updateInspectionState,
} = require('./state');
const {
  createInspection,
  uploadInspectionAttachment,
} = require('./service');
const {
  inspectionSummaryFlex,
  inspectionPendingFlex,
} = require('../../flex/inspectFlex');
const { replyOrPush } = require('../../reply');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const userRepo = require('../../../../backend/repositories/user.repo');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText, parseTimeFromText } = require('../../utils/attendance');
const { logEvent } = require('../../utils/audit');

function getStateKey(event) {
  return event.source && event.source.userId;
}

function getEventDate(event) {
  return event.timestamp ? new Date(event.timestamp) : new Date();
}

function getSubmitterName(employee, lineUserId) {
  if (employee) return employee.nickname || employee.name;
  return lineUserId || 'ไม่ระบุ';
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const lower = String(text || '').trim().toLowerCase();

  if (lower === 'ตรวจเสร็จ') {
    return handleDone(event);
  }

  if (lower === 'ยืนยันส่ง') {
    return handleConfirm(event);
  }

  return startInspection(event);
}

async function startInspection(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getStateKey(event);

  if (!stateKey) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE user id สำหรับเริ่มตรวจร้าน' }] });
    return null;
  }

  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: พนักงาน <รหัสพนักงาน>' }] });
    return null;
  }

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ตรวจร้าน CCA' }] });
    return null;
  }

  const eventTime = getEventDate(event);
  const workDate = parseDateFromText(text, eventTime);
  const submitTime = parseTimeFromText(text, eventTime);

  setInspectionState(stateKey, {
    status: INSPECTION_STATUS.COLLECTING_PHOTOS,
    branchId: branch.id,
    branchCode: branch.code,
    employeeId: employee.id,
    submitterName: getSubmitterName(employee, lineUserId),
    lineGroupId,
    lineUserId,
    workDate,
    submitTime,
    submittedAt: eventTime.toISOString(),
    messageText: text,
    imageMessages: [],
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'เริ่มตรวจร้านแล้ว ส่งรูปได้เลย เมื่อครบแล้วพิมพ์ “ตรวจเสร็จ”' }],
  });
  return true;
}

async function handleImageMessage(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state || state.status !== INSPECTION_STATUS.COLLECTING_PHOTOS) return false;

  const messageId = event.message && event.message.id;
  if (!messageId) return true;

  const imageMessages = [...(state.imageMessages || []), messageId];
  updateInspectionState(stateKey, { imageMessages });

  // Deliberately no reply: inspection photos should not flood the group chat.
  return true;
}

async function handleDone(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่ได้เริ่มตรวจร้าน พิมพ์ “ตรวจร้าน” ก่อนส่งรูป' }] });
    return null;
  }

  const photoCount = (state.imageMessages || []).length;
  if (photoCount === 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีรูปตรวจร้าน กรุณาส่งรูปอย่างน้อย 1 รูป' }] });
    return null;
  }

  updateInspectionState(stateKey, { status: INSPECTION_STATUS.READY_TO_SUBMIT });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [inspectionSummaryFlex({
      branchCode: state.branchCode,
      submitterName: state.submitterName,
      photoCount,
      workDate: state.workDate,
      submitTime: state.submitTime,
    })],
  });
  return true;
}

async function handleConfirm(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state || state.status !== INSPECTION_STATUS.READY_TO_SUBMIT) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีสรุปตรวจร้านให้ยืนยัน พิมพ์ “ตรวจเสร็จ” ก่อน' }] });
    return null;
  }

  const imageMessages = state.imageMessages || [];
  const inspection = await createInspection({
    branchId: state.branchId,
    employeeId: state.employeeId,
    workDate: state.workDate,
    submitTime: state.submitTime,
    photoCount: imageMessages.length,
    inspectionItems: {
      source: 'line',
      flow: 'store_inspection',
      photo_count: imageMessages.length,
      submitted_by_name: state.submitterName,
    },
    source: 'line',
    lineGroupId: state.lineGroupId,
    lineUserId: state.lineUserId,
    messageText: state.messageText,
    submittedAt: state.submittedAt,
  });

  const uploaded = [];
  for (const messageId of imageMessages) {
    try {
      uploaded.push(await uploadInspectionAttachment({ inspectionId: inspection.id, messageId }));
    } catch (err) {
      console.warn('Inspection image upload failed:', messageId, err.message || err);
    }
  }

  const pendingFlex = inspectionPendingFlex({
    inspectionId: inspection.id,
    branchCode: state.branchCode,
    submitterName: state.submitterName,
    photoCount: uploaded.length || imageMessages.length,
    workDate: state.workDate,
    submitTime: state.submitTime,
  });

  await replyOrPush({ replyToken: event.replyToken, messages: [pendingFlex] });

  const managers = await userRepo.findBranchManagers({ id: state.branchId, code: state.branchCode });
  for (const manager of managers) {
    await replyOrPush({ to: manager.line_user_id, messages: [pendingFlex] });
  }

  setInspectionState(stateKey, null);
  await logEvent('inspection_submitted', {
    table_name: 'store_inspections',
    record_id: inspection.id,
    branch_id: state.branchId,
    actor: state.employeeId,
    photo_count: uploaded.length || imageMessages.length,
    manager_count: managers.length,
  });
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
};
