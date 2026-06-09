const { updateLeaveStatus } = require('./flows/leave/service');
const { updateSaleStatus } = require('./flows/sales/service');
const { replyOrPush } = require('./reply');
const { logEvent } = require('./utils/audit');

async function handlePostback(event) {
  const data = event.postback && event.postback.data;
  if (!data) return null;

  const actor = event.source && event.source.userId ? event.source.userId : null;

  // leave_action|<id>|approve
  if (data.startsWith('leave_action|')) {
    const parts = data.split('|');
    const leaveId = parts[1];
    const action = parts[2];

    if (action === 'approve') {
      await updateLeaveStatus(leaveId, 'approved', actor);
      await logEvent('leave_approved', { leaveId, actor });
      await replyOrPush({ to: actor, messages: [{ type: 'text', text: `อนุมัติการลา ID: ${leaveId}` }] });
      return true;
    }

    if (action === 'reject') {
      await updateLeaveStatus(leaveId, 'rejected', actor);
      await logEvent('leave_rejected', { leaveId, actor });
      await replyOrPush({ to: actor, messages: [{ type: 'text', text: `ปฏิเสธการลา ID: ${leaveId}` }] });
      return true;
    }
  }

  // sales_confirm|<saleId>
  if (data.startsWith('sales_confirm|')) {
    const saleId = data.split('|')[1];
    // Keep status as draft for now (awaiting approval)
    await logEvent('sales_confirmed_by_submitter', { sale_id: saleId, actor });
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ยืนยันยอดขายเรียบร้อย ID: ${saleId}\n\nรอการอนุมัติจากผู้จัดการ` }] });
    return true;
  }

  // sales_edit|<saleId>
  if (data.startsWith('sales_edit|')) {
    const saleId = data.split('|')[1];
    await logEvent('sales_edit_requested', { sale_id: saleId, actor });
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ขอแก้ไขยอดขาย ID: ${saleId}\n\nกรุณาส่งข้อมูลใหม่` }] });
    return true;
  }

  // other postback handlers can be added here
  return null;
}

module.exports = { handlePostback };
