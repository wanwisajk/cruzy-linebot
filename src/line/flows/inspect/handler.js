const {
  INSPECTION_STATUS,
  getInspectionState,
  setInspectionState,
  updateInspectionState,
} = require('./state');
const {
  findOpeningInspection,
  listInspectionAttachments,
  createInspection,
  uploadInspectionAttachment,
  syncInspectionPhotoCount,
} = require('./service');
const {
  inspectionLiffEntryFlex,
  inspectionSummaryFlex,
  inspectionPendingFlex,
} = require('../../flex/inspectFlex');
const { replyOrPush } = require('../../reply');
const userRepo = require('../../../../backend/repositories/user.repo');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText, parseTimeFromText } = require('../../utils/attendance');
const { logEvent } = require('../../utils/audit');
const { getDisplayName } = require('../../utils/displayName');

const DEFAULT_INSPECTION_LIFF_URL = 'https://liff.line.me/2010334830-E2aZbMzY';

function getStateKey(event) {
  const source = event.source || {};
  return source.groupId || source.roomId || source.userId || null;
}

function getEventDate(event) {
  return event.timestamp ? new Date(event.timestamp) : new Date();
}

function getSubmitterName(actor, lineUserId) {
  return getDisplayName(actor && actor.employee, actor && actor.user, actor && actor.name, lineUserId);
}

function inspectionLiffBaseUrl() {
  return String(
    process.env.LIFF_INSPECTION_URL ||
    DEFAULT_INSPECTION_LIFF_URL
  ).replace(/\/+$/, '');
}

function buildInspectionLiffUrl({ branchId, employeeId, workDate, lineUserId, branchCode }) {
  const baseUrl = inspectionLiffBaseUrl();
  if (!baseUrl) return null;
  const path = baseUrl.includes('liff.line.me/') || baseUrl.endsWith('/liff/inspection')
    ? baseUrl
    : `${baseUrl}/liff/inspection`;
  const query = new URLSearchParams({
    branchId: String(branchId),
    employeeId: String(employeeId),
    date: String(workDate),
  });
  if (lineUserId) query.set('lineUserId', String(lineUserId));
  if (branchCode) query.set('branchCode', String(branchCode));
  return `${path}?${query.toString()}`;
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const lower = String(text || '').trim().toLowerCase();

  if (lower === 'ยกเลิก') {
    return handleCancel(event);
  }

  if (lower.includes('แก้ไข')) {
    return handleEdit(event);
  }

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

  const actor = await resolveLineActor(lineUserId);
  if (!actor || !actor.type) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: พนักงาน <รหัสพนักงาน> หรือ แอดมิน <user id>' }] });
    return null;
  }

  if (!actor.employee) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: 'ยังไม่พบพนักงานของผู้ตรวจ ระบบต้องใช้ employees.id เพื่อบันทึกลง store_inspections.submitted_by\nกรุณาผูก LINE ด้วยคำสั่ง: พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      }],
    });
    return null;
  }

  const eventTime = getEventDate(event);
  const workDate = parseDateFromText(text, eventTime);
  const submitTime = parseTimeFromText(text, eventTime);
  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text, {
    employeeId: actor.employee ? actor.employee.id : null,
    workDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <ตัวย่อสาขา> เช่น สาขา CCA หรือพิมพ์เช่น ตรวจร้าน CCA' }] });
    return null;
  }

  const openingInspection = await findOpeningInspection({ branchId: branch.id, workDate });
  if (!openingInspection) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ยังไม่ได้เปิดร้านของวันที่ ${workDate} กรุณาพิมพ์ “เปิดร้าน ${branch.code}” ก่อน แล้วค่อยพิมพ์ “ตรวจร้าน” เพื่อส่งรูป` }] });
    return null;
  }
  const submitterName = getSubmitterName(actor, lineUserId);
  const liffUrl = buildInspectionLiffUrl({
    branchId: branch.id,
    employeeId: actor.employee.id,
    workDate,
    lineUserId,
    branchCode: branch.code,
  });

  if (!liffUrl) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยังไม่ได้ตั้งค่า LIFF_URL หรือ LIFF_INSPECTION_URL สำหรับเปิดหน้าตรวจร้าน' }],
    });
    return null;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [inspectionLiffEntryFlex({
      branchCode: branch.code,
      submitterName,
      workDate,
      uri: liffUrl,
    })],
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
  return true;
}

async function handleDone(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่ได้เริ่มตรวจร้าน พิมพ์ “ตรวจร้าน” ก่อนส่งรูป' }] });
    return null;
  }

  const newPhotoCount = (state.imageMessages || []).length;
  const photoCount = Number(state.openingPhotoCount || 0) + newPhotoCount;
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
  const openingPhotoCount = Number(state.openingPhotoCount || 0);
  const totalPhotoCount = openingPhotoCount + imageMessages.length;
  const inspection = await createInspection({
    branchId: state.branchId,
    employeeId: state.employeeId,
    workDate: state.workDate,
    submitTime: state.submitTime,
    photoCount: totalPhotoCount,
    inspectionItems: {
      source: 'line',
      flow: 'store_inspection',
      photo_count: totalPhotoCount,
      opening_photo_count: openingPhotoCount,
      inspection_photo_count: imageMessages.length,
      submitted_by_name: state.submitterName,
    },
    source: 'line',
    lineGroupId: state.lineGroupId,
    lineUserId: state.lineUserId,
    messageText: state.messageText,
    submittedAt: state.submittedAt,
    auditActorType: state.auditActorType || 'line',
    auditActorId: state.auditActorId || state.lineUserId,
    auditActorName: state.auditActorName || state.submitterName,
  });

  const uploaded = [];
  for (const messageId of imageMessages) {
    try {
      uploaded.push(await uploadInspectionAttachment({ inspectionId: inspection.id, messageId }));
    } catch (err) {
      console.warn('Inspection image upload failed:', messageId, err.message || err);
    }
  }

  const { photoCount } = await syncInspectionPhotoCount(inspection.id);
  const allAttachments = await listInspectionAttachments(inspection.id);
  const attachments = allAttachments.length
    ? allAttachments
    : [
      ...(state.openingAttachments || []),
      ...uploaded,
    ];

  const pendingFlex = inspectionPendingFlex({
    inspectionId: inspection.id,
    branchCode: state.branchCode,
    submitterName: state.submitterName,
    photoCount,
    attachments,
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
    photo_count: photoCount,
    manager_count: managers.length,
  });
  return true;
}

async function handleCancel(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state) return null;

  setInspectionState(stateKey, null);
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'ยกเลิกคำสั่งตรวจร้านแล้วครับ' }],
  });
  return true;
}

async function handleEdit(event) {
  const stateKey = getStateKey(event);
  const state = stateKey ? getInspectionState(stateKey) : null;
  if (!state) return null;

  setInspectionState(stateKey, null);
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'เริ่มตรวจร้านใหม่ได้เลยครับ พิมพ์ “ตรวจร้าน” ใหม่ แล้วส่งรูปตรวจร้านอีกครั้ง' }],
  });
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
};
