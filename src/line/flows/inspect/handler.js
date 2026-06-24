const { findOpeningInspection } = require('./service');
const { inspectionLiffEntryFlex } = require('../../flex/inspectFlex');
const { replyOrPush } = require('../../reply');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { parseDateFromText } = require('../../utils/attendance');
const { getDisplayName } = require('../../utils/displayName');
const { getConfiguredLiffBaseUrl, appendQueryToLiffUrl } = require('../../utils/liff');

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
  return getConfiguredLiffBaseUrl('LIFF_INSPECTION_URL', 'LIFF_URL');
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
  return appendQueryToLiffUrl(path, query);
}

async function handle(event) {
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
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน> หรือ #แอดมิน <user id>' }] });
    return null;
  }

  if (!actor.employee) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: 'ยังไม่พบพนักงานของผู้ตรวจ ระบบต้องใช้ employees.id เพื่อบันทึกลง store_inspections.submitted_by\nกรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      }],
    });
    return null;
  }

  const eventTime = getEventDate(event);
  const workDate = parseDateFromText(text, eventTime);
  const { branch } = await resolveBranchFromEvent(event, text, {
    employeeId: actor.employee ? actor.employee.id : null,
    workDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: #สาขา <ตัวย่อสาขา> เช่น #สาขา CCA หรือพิมพ์เช่น #ตรวจร้าน CCA' }] });
    return null;
  }

  const openingInspection = await findOpeningInspection({ branchId: branch.id, workDate });
  if (!openingInspection) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ยังไม่ได้เปิดร้านของวันที่ ${workDate} กรุณาพิมพ์ “#เปิดร้าน ${branch.code}” ก่อน แล้วค่อยพิมพ์ “#ตรวจร้าน” เพื่อเปิดหน้าตรวจร้าน` }] });
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
      messages: [{ type: 'text', text: 'ยังไม่ได้ตั้งค่า LIFF_URL สำหรับเปิดหน้าตรวจร้าน' }],
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
  return false;
}

module.exports = {
  handle,
  handleImageMessage,
};
