const depositFlex = require('../../flex/depositFlex');
const { replyOrPush } = require('../../reply');
const { parseDepositText } = require('./parser');
const {
  resolveBankAccount,
  resolveBranchBankAccount,
  fetchSalesCashSnapshot,
} = require('./service');
const { getBranchCashPending } = require('../../../../backend/services/branchCashLedger.service');
const { getDepositState, setDepositState, DEPOSIT_STATUS } = require('./state');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');
const { buildLineAudit } = require('../../utils/lineAudit');

function bangkokDateString(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCancelCommand(text) {
  return /^ยกเลิก$/i.test(String(text || '').trim());
}

function isEditCommand(text) {
  return /แก้ไข/i.test(String(text || '').trim());
}

function isSendPhotoCommand(text) {
  return /^(?:ส่งรูป|ส่งสลิป|ส่งรูปสลิป|อัพรูป|อัปโหลดรูป)$/i.test(String(text || '').trim());
}

function slipPromptMessage() {
  return {
    type: 'text',
    text: 'ส่งรูปสลิปหลักฐานการฝากเงินได้เลย หากต้องแก้ไขให้พิมพ์ “แก้ไข” เพื่อเริ่ม #ฝากเงิน ใหม่ หรือพิมพ์ “ยกเลิก” เพื่อหยุดคำสั่ง',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'cameraRoll',
            label: 'เลือกรูป',
          },
        },
        {
          type: 'action',
          action: {
            type: 'camera',
            label: 'ถ่ายรูป',
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'แก้ไข',
            text: 'แก้ไข',
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'ยกเลิก',
            text: 'ยกเลิก',
          },
        },
      ],
    },
  };
}

async function getPendingCashAfterDeposit(state) {
  try {
    const currentPending = await getBranchCashPending(state.branchId);
    return currentPending - Number(state.amount || 0);
  } catch (err) {
    console.warn('Unable to calculate pending cash after deposit:', err.message || err, {
      branchId: state && state.branchId,
    });
    return null;
  }
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const actor = source.userId || null;
  const eventDate = event.timestamp ? new Date(event.timestamp) : new Date();

  if (!actor) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่สามารถระบุตัวตนผู้ส่งได้' }] });
    return;
  }

  const actorInfo = await resolveLineActor(actor);
  if (!actorInfo || !actorInfo.employee) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: 'ยังไม่พบพนักงานของผู้ฝาก ระบบต้องใช้ employees.id เพื่อบันทึกลง cash_deposits.deposited_by\nกรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      }],
    });
    return;
  }

  const pending = getDepositState(actor);
  if (pending && pending.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    return handleActiveTextMessage(event);
  }

  if (pending && pending.status === DEPOSIT_STATUS.AWAITING_CONFIRMATION) {
    return handleActiveTextMessage(event);
  }

  const parsed = parseDepositText(text, eventDate);
  if (!parsed.amount || parsed.amount <= 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ฝากเงิน เช่น: #ฝากเงิน 15/06/2026 ฝากเงิน 1,500' }] });
    return;
  }

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text, {
    employeeId: actorInfo && actorInfo.employee ? actorInfo.employee.id : null,
    workDate: parsed.depositDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: #สาขา <ตัวย่อสาขา> เช่น #สาขา CCA หรือพิมพ์เช่น #ฝากเงิน CCA 15/06/2026 ฝากเงิน 1,500' }] });
    return;
  }

  const salesCash = await fetchSalesCashSnapshot({
    branchId: branch.id,
    sellDate: parsed.depositDate,
  });
  if (!salesCash.count) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `ยังไม่พบยอดขายเงินสดของสาขา ${branch.code} วันที่ ${parsed.depositDate}\nกรุณาส่ง #ยอดขาย ของวันนั้นก่อน หรือเช็กวันที่ฝากเงินอีกครั้ง` }],
    });
    return;
  }

  const expectedAmount = salesCash.amount;
  const varianceAmount = expectedAmount - parsed.amount;

  const bankAccount = await resolveBankAccount(parsed.bank, parsed.bankShort) || await resolveBranchBankAccount(branch.id);
  const actorName = getDisplayName(actorInfo.employee, actorInfo.user, actorInfo.name, actor);
  const audit = buildLineAudit({ lineUserId: actor, lineGroupId, actor: actorInfo });
  const actualDepositDate = bangkokDateString(eventDate);

  setDepositState(actor, {
    status: DEPOSIT_STATUS.AWAITING_SLIP,
    amount: parsed.amount,
    expectedAmount,
    varianceAmount,
    salesSnapshotCount: salesCash.count,
    salesSnapshotIds: salesCash.sales.map((sale) => sale.id),
    depositDate: actualDepositDate,
    coveredDate: parsed.depositDate,
    bank: parsed.bank,
    bankShort: parsed.bankShort,
    bankAccountId: bankAccount ? bankAccount.id : null,
    bankAccountName: bankAccount ? bankAccount.account_name : null,
    bankAccountNo: bankAccount ? bankAccount.account_no : null,
    branchId: branch.id,
    branchCode: branch.code,
    branchName: branch.name,
    lineGroupId,
    lineUserId: actor,
    messageText: text,
    submittedAt: eventDate.toISOString(),
    diff: parsed.diff,
    actorType: audit.auditActorType,
    actorId: audit.auditActorId,
    actorName,
    auditActorType: audit.auditActorType,
    auditActorId: audit.auditActorId,
    auditActorName: audit.auditActorName,
    employeeId: actorInfo.employee ? actorInfo.employee.id : null,
    employeeName: actorName,
    replyToken: event.replyToken,
    slipUrls: [],
    slipMessageIds: [],
    source: 'line',
  });

  await replyOrPush({ replyToken: event.replyToken, messages: [slipPromptMessage()] });
}

async function handleActiveTextMessage(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const actor = source.userId || null;
  const state = actor ? getDepositState(actor) : null;

  if (!actor || !state) return null;

  if (isCancelCommand(text)) {
    setDepositState(actor, null);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยกเลิกรายการฝากเงินแล้วครับ' }],
    });
    return true;
  }

  if (isEditCommand(text)) {
    setDepositState(actor, null);
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'เริ่มฝากเงินใหม่ได้เลยครับ พิมพ์ #ฝากเงิน พร้อมจำนวนเงินใหม่ แล้วส่งรูปสลิปอีกครั้ง' }],
    });
    return true;
  }

  if (isSendPhotoCommand(text) && state.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    await replyOrPush({ replyToken: event.replyToken, messages: [slipPromptMessage()] });
    return true;
  }

  if (state.status === DEPOSIT_STATUS.AWAITING_CONFIRMATION) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ตรวจสรุปฝากเงินแล้วกด “ยืนยันส่ง”, “แก้ไขข้อมูล” หรือ “ยกเลิก” ในการ์ดสรุปได้เลยครับ' }],
    });
    return true;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'รอรูปสลิปอยู่ครับ ส่งรูปสลิปได้เลย หรือพิมพ์ “แก้ไข” / “ยกเลิก”' }],
  });
  return true;
}

async function handleImageMessage(event) {
  const source = event.source || {};
  const actor = source.userId || null;

  if (!actor) return false;

  const state = getDepositState(actor);
  if (!state || (state.status !== DEPOSIT_STATUS.AWAITING_SLIP && state.status !== DEPOSIT_STATUS.AWAITING_CONFIRMATION)) {
    return false;
  }

  const messageId = event.message && event.message.id;
  if (!messageId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบรูปสลิป กรุณาส่งรูปอีกครั้ง' }] });
    return true;
  }

  const slipMessageIds = Array.isArray(state.slipMessageIds) ? state.slipMessageIds.slice() : [];
  if (!slipMessageIds.includes(messageId)) {
    slipMessageIds.push(messageId);
  }

  const nextStatus = state.status === DEPOSIT_STATUS.AWAITING_SLIP
    ? DEPOSIT_STATUS.AWAITING_CONFIRMATION
    : state.status;
  setDepositState(actor, {
    ...state,
    status: nextStatus,
    slipMessageIds,
    tempId: String(actor),
  });

  const pendingCashBalance = await getPendingCashAfterDeposit(state);
  const confirmFlex = depositFlex.depositConfirmFlex({
    tempId: actor,
    amount: state.amount,
    bank: state.bankAccountName || state.bankShort || state.bank,
    slipCount: slipMessageIds.length,
    branchCode: state.branchCode,
    submitterName: state.employeeName,
    depositDate: state.depositDate,
    coveredDate: state.coveredDate,
    expectedAmount: state.expectedAmount,
    varianceAmount: state.varianceAmount,
    pendingCashBalance,
  });
  await replyOrPush({ replyToken: event.replyToken, messages: [confirmFlex] });
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
  handleActiveTextMessage,
};
