const branchRepo = require('../../../../backend/repositories/branch.repo');
const userRepo = require('../../../../backend/repositories/user.repo');
const { lineClient } = require('../../../../backend/config/line');
const { replyOrPush } = require('../../reply');
const { logEvent } = require('../../utils/audit');

async function getLineGroupName(groupId) {
  if (!groupId) return null;

  try {
    const summary = await lineClient.getGroupSummary(groupId);
    return summary && summary.groupName ? String(summary.groupName).trim() : null;
  } catch (err) {
    console.warn('Unable to fetch LINE group summary:', err.message || err, { groupId });
    return null;
  }
}

async function handleBranchLink(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const match = text.match(/^#\s*สาขา\s+([A-Za-z][A-Za-z0-9_-]{1,15})$/i);
  const groupId = event.source && event.source.groupId;

  if (!groupId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คำสั่งนี้ต้องพิมพ์ในกลุ่มสาขาเท่านั้น' }] });
    return;
  }

  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: #สาขา <ตัวย่อสาขา> เช่น #สาขา CCA' }] });
    return;
  }

  const branchCode = match[1].toUpperCase();
  const branch = await branchRepo.findByCode(branchCode);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบสาขารหัส ${branchCode}` }] });
    return;
  }

  const groupName = await getLineGroupName(groupId);
  const linked = await branchRepo.updateLineGroupIdByCode(branchCode, groupId, groupName);
  await logEvent('branch_line_group_linked', {
    branch_id: linked.id,
    branch_code: linked.code,
    line_group_id: groupId,
    line_group_name: groupName,
    previous_line_group_id: branch.line_group_id || null,
    previous_line_group_name: branch.line_group_name || null,
  });
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `ผูกกลุ่ม LINE กับสาขา ${linked.code} สำเร็จ\nชื่อกลุ่ม: ${groupName || 'อ่านชื่อกลุ่มไม่ได้'}`,
    }],
  });
}

async function handleAdminLink(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const match = text.trim().match(/^#\s*แอดมิน\s+(\S{1,255})$/i);
  const lineUserId = event.source && event.source.userId;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบ LINE userId' }] });
    return;
  }

  if (!match) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ใช้รูปแบบ: #แอดมิน <user id> เช่น #แอดมิน admin001' }] });
    return;
  }

  const adminId = match[1].trim();
  const user = await userRepo.findById(adminId);
  if (!user) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบ user id ${adminId}` }] });
    return;
  }

  const linked = await userRepo.updateLineUserId(adminId, lineUserId);
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
