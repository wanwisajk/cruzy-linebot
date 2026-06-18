const depositFlex = require('../../flex/depositFlex');
const { replyOrPush } = require('../../reply');
const { parseDepositText } = require('./parser');
const {
  getLineMessageContentBuffer,
  verifyDepositSlip,
  resolveBankAccount,
  resolveBranchBankAccount,
} = require('./service');
const { getDepositState, setDepositState, DEPOSIT_STATUS } = require('./state');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');

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
        text: 'ยังไม่พบพนักงานของผู้ฝาก ระบบต้องใช้ employees.id เพื่อบันทึกลง cash_deposits.deposited_by\nกรุณาผูก LINE ด้วยคำสั่ง: พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      }],
    });
    return;
  }

  const pending = getDepositState(actor);
  if (pending && pending.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'รอรูปสลิปจากยอดฝากก่อนหน้าก่อนครับ ส่งรูปเพิ่มได้เลย หรือกด "ยืนยันส่ง" เมื่อพร้อม' }] });
    return;
  }

  const parsed = parseDepositText(text, eventDate);
  if (!parsed.amount || parsed.amount <= 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ยอดฝาก เช่น: ฝากเงิน 18/06 1,500' }] });
    return;
  }

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text, {
    employeeId: actorInfo && actorInfo.employee ? actorInfo.employee.id : null,
    workDate: parsed.depositDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ฝากเงิน 18/06 1,500' }] });
    return;
  }

  const bankAccount = await resolveBankAccount(parsed.bank, parsed.bankShort) || await resolveBranchBankAccount(branch.id);
  const actorName = getDisplayName(actorInfo.employee, actorInfo.user, actorInfo.name, actor);

  setDepositState(actor, {
    status: DEPOSIT_STATUS.AWAITING_SLIP,
    amount: parsed.amount,
    depositDate: parsed.depositDate,
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
    actorType: actorInfo.type,
    actorId: actorInfo.id,
    actorName,
    employeeId: actorInfo.employee ? actorInfo.employee.id : null,
    employeeName: actorName,
    replyToken: event.replyToken,
    slipUrls: [],
    slipMessageIds: [],
    source: 'line',
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `ส่งรูปสลิปหลักฐานการฝากเงินได้เลย แล้วระบบจะสรุปยอดฝาก`,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'cameraRoll',
                label: '📸 เลือกรูป',
              },
            },
            {
              type: 'action',
              action: {
                type: 'camera',
                label: '📷 ถ่ายรูป',
              },
            },
          ],
        },
      },
    ],
  });
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

  const buffer = await getLineMessageContentBuffer(messageId);
  let slipCheck = null;
  try {
    slipCheck = await verifyDepositSlip({
      buffer,
      expectedAmount: state.amount,
    });
  } catch (err) {
    console.warn('Deposit slip OCR failed:', err.message || err, {
      messageId,
      expectedAmount: state.amount,
    });
  }

  if (slipCheck && !slipCheck.ok) {
    let text;
    if (slipCheck.reason === 'amount_mismatch') {
      text = `ยอดเงินในสลิปไม่ตรงกับยอดฝากที่พิมพ์ไว้\nยอดที่พิมพ์: ${Number(slipCheck.expectedAmount || state.amount).toLocaleString()} บาท\nยอดในสลิป: ${slipCheck.actualAmount != null ? Number(slipCheck.actualAmount).toLocaleString() : '-'} บาท\nกรุณาส่งรูปสลิปของยอดที่ถูกต้องอีกครั้ง`;
    } else {
      text = `อ่านยอดเงินในสลิปไม่ชัดเจน\nยอดที่พิมพ์: ${Number(slipCheck.expectedAmount || state.amount).toLocaleString()} บาท\nกรุณาส่งรูปสลิปที่เห็นยอดเงินชัดเจนอีกครั้ง`;
    }

    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text }] });
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
    slipOcr: slipCheck ? slipCheck.ocr : state.slipOcr,
    slipAmountVerified: slipCheck ? !slipCheck.skipped : false,
    tempId: String(actor),
  });

  if (state.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    const confirmFlex = depositFlex.depositConfirmFlex({
      tempId: actor,
      amount: state.amount,
      bank: state.bankAccountName || state.bankShort || state.bank,
      slipCount: slipMessageIds.length,
      branchCode: state.branchCode,
      submitterName: state.employeeName,
      depositDate: state.depositDate,
    });
    await replyOrPush({ replyToken: event.replyToken, messages: [confirmFlex] });
  }
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
};
