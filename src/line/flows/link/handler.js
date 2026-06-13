const branchRepo = require('../../../../backend/repositories/branch.repo');
const userRepo = require('../../../../backend/repositories/user.repo');
const { replyOrPush } = require('../../reply');
const { logEvent } = require('../../utils/audit');

async function handleBranchLink(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const match = text.match(/^สาขา\s+(\d+)$/i);
  const groupId = event.source && event.source.groupId;

  if (!groupId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คำสั่งนี้ต้องพิมพ์ในกลุ่มสาขาเท่านั้น' }] });
    return;
  }

  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: สาขา <รหัส id สาขา>' }] });
    return;
  }

  const branch = await branchRepo.updateLineGroupId(match[1], groupId);
  await logEvent('branch_line_group_linked', { branch_id: branch.id, line_group_id: groupId });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: `ผูกกลุ่ม LINE กับสาขา ${branch.code} สำเร็จ` }],
  });
}

async function handleAdminLink(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const match = text.match(/^แอดมิน\s+(\d+)$/i);
  const lineUserId = event.source && event.source.userId;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE userId' }] });
    return;
  }

  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: แอดมิน <user id>' }] });
    return;
  }

  const user = await userRepo.findById(match[1]);
  if (!user) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบ user id ${match[1]}` }] });
    return;
  }

  const linked = await userRepo.updateLineUserId(match[1], lineUserId);
  await logEvent('admin_line_user_linked', { user_id: linked.id, username: linked.username, line_user_id: lineUserId });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: `ผูก LINE แอดมินสำเร็จ\n${linked.name} (${linked.username})` }],
  });
}

module.exports = {
  handleBranchLink,
  handleAdminLink,
};
