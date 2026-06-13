const depositFlex = require('../../flex/depositFlex');
const { replyOrPush } = require('../../reply');
const { parseDepositText } = require('./parser');
const { recordDeposit, uploadSlipImage } = require('./service');
const { getDepositState, setDepositState, DEPOSIT_STATUS } = require('./state');
const { logEvent } = require('../../utils/audit');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
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

  const employee = await employeeRepo.findByLineUserId(actor);
  const pending = getDepositState(actor);
  if (pending && pending.status === DEPOSIT_STATUS.AWAITING_SLIP) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'รอรูปสลิปจากยอดฝากก่อนหน้าก่อนครับ ส่งรูปสลิป 1 รูปได้เลย' }] });
    return;
  }

  const parsed = parseDepositText(text, eventDate);
  if (!parsed.amount || parsed.amount <= 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ยอดฝาก เช่น: ฝาก CCA 1,500' }] });
    return;
  }

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ฝาก CCA 1,500' }] });
    return;
  }

  setDepositState(actor, {
    status: DEPOSIT_STATUS.AWAITING_SLIP,
    amount: parsed.amount,
    depositDate: parsed.depositDate,
    bank: parsed.bank,
    branchId: branch.id,
    branchCode: branch.code,
    branchName: branch.name,
    lineGroupId,
    lineUserId: actor,
    messageText: text,
    submittedAt: eventDate.toISOString(),
    diff: parsed.diff,
    actor,
    employeeId: employee ? employee.id : null,
    employeeName: employee ? (employee.nickname ? `${employee.name} (${employee.nickname})` : employee.name) : 'ไม่ระบุผู้ฝาก',
    replyToken: event.replyToken,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `บันทึกยอดฝาก ${Number(parsed.amount).toLocaleString()} บาท\nวันที่ ${parsed.depositDate}\nสาขา ${branch.code}${parsed.bank ? `\nธนาคาร: ${parsed.bank}` : ''}\nส่งรูปสลิป 1 รูปได้เลยครับ`,
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
  if (!state || state.status !== DEPOSIT_STATUS.AWAITING_SLIP) {
    return false;
  }

  const messageId = event.message && event.message.id;
  if (!messageId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบรูปสลิป กรุณาส่งรูปอีกครั้ง' }] });
    return true;
  }

  const slipUrl = await uploadSlipImage(messageId);
  const created = await recordDeposit({
    deposit_date: state.depositDate,
    branch_id: state.branchId,
    deposited_by: state.employeeId,
    deposited_amount: state.amount,
    bank: state.bank || null,
    slip_url: slipUrl,
    source: 'line',
    line_group_id: state.lineGroupId,
    line_user_id: state.lineUserId,
    message_text: state.messageText,
    submitted_at: state.submittedAt,
  });

  await logEvent('deposit_recorded', { deposit: created, actor });
  setDepositState(actor, null);

  const flex = depositFlex({
    amount: state.amount,
    bank: state.bank,
    diff: state.diff,
    branchCode: state.branchCode,
    depositDate: state.depositDate,
    depositedBy: state.employeeName,
    slipUrl,
  });
  await replyOrPush({ replyToken: event.replyToken, messages: [flex] });
  return true;
}

module.exports = {
  handle,
  handleImageMessage,
};
