const depositFlex = require('../../flex/depositFlex');
const { replyOrPush } = require('../../reply');
const { parseDepositText } = require('./parser');
const { recordDeposit, uploadSlipImage, resolveBankAccount } = require('./service');
const { getDepositState, setDepositState, DEPOSIT_STATUS } = require('./state');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');

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
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ยอดฝาก เช่น: ฝาก CCA 1,500' }] });
    return;
  }

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text, {
    employeeId: actorInfo && actorInfo.employee ? actorInfo.employee.id : null,
    workDate: parsed.depositDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ฝาก CCA 1,500' }] });
    return;
  }

  const bankAccount = await resolveBankAccount(parsed.bank, parsed.bankShort);

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
    actorName: actorInfo.name || 'ไม่ระบุผู้ฝาก',
    employeeId: actorInfo.employee ? actorInfo.employee.id : null,
    employeeName: actorInfo.name || 'ไม่ระบุผู้ฝาก',
    replyToken: event.replyToken,
    slipUrls: [],
    source: 'line',
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `บันทึกยอดฝาก ${Number(parsed.amount).toLocaleString()} บาท\nวันที่ ${parsed.depositDate}\nสาขา ${branch.code}${parsed.bankShort ? `\nธนาคาร: ${parsed.bankShort}` : parsed.bank ? `\nธนาคาร: ${parsed.bank}` : ''}\nส่งรูปสลิป 1 รูปได้เลยครับ`,
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

  const slipUrl = await uploadSlipImage(messageId);
  const slipUrls = Array.isArray(state.slipUrls) ? state.slipUrls.slice() : [];
  slipUrls.push(slipUrl);
  const nextStatus = state.status === DEPOSIT_STATUS.AWAITING_SLIP
    ? DEPOSIT_STATUS.AWAITING_CONFIRMATION
    : state.status;
  setDepositState(actor, {
    ...state,
    status: nextStatus,
    slipUrl,
    slipUrls,
    tempId: String(actor),
  });

  if (state.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    const confirmFlex = depositFlex.depositConfirmFlex({
      tempId: actor,
      amount: state.amount,
      bank: state.bankAccountName || state.bankShort || state.bank,
      slipCount: slipUrls.length,
    });
    await replyOrPush({ replyToken: event.replyToken, messages: [confirmFlex] });
  }
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
};
