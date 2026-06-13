const openHandler = require('./flows/open/handler');
const inspectHandler = require('./flows/inspect/handler');
const registerHandler = require('./flows/register/handler');
const { handleTextMessage, handleImageMessage, handleUploadPrompt, handleEditFlow } = require('./flows/sales/handler');
const depositHandler = require('./flows/deposit/handler');
const { getDepositState, DEPOSIT_STATUS } = require('./flows/deposit/state');
const commandFlex = require('./flex/commandFlex');
const employeeHandler = require('./flows/employee/handler');
const { replyOrPush } = require('./reply');
const linkHandler = require('./flows/link/handler');
const { logInboundLineEvent } = require('./utils/audit');
const { hasInspectionState } = require('./flows/inspect/state');
const { hasLeaveState } = require('./flows/leave/state');
const leaveHandler = require('./flows/leave/handler');

function isOpenShopCommand(text) {
  return /เปิด\s*ร้าน/i.test(text);
}

function isCloseShopCommand(text) {
  return /ปิด\s*ร้าน/i.test(text) || /ปิด้ราน/i.test(text) || /ปิดราน/i.test(text);
}

async function handleEvent(event) {
  try {
    console.log('📨 Event received:', {
      type: event.type,
      message_type: event.message?.type,
      text: event.message?.text?.substring(0, 50),
    });
    await logInboundLineEvent(event);

    // handle postbacks
    if (event.type === 'postback') {
      const postbackHandler = require('./postback');
      return postbackHandler.handlePostback(event);
    }

    // Handle file/image events for active multi-step flows
    if (event.message && (event.message.type === 'image' || event.message.type === 'file')) {
      const source = event.source || {};
      const lineUserId = source.userId || null;
      if (lineUserId && hasLeaveState(lineUserId)) {
        return leaveHandler.handleAttachmentMessage(event);
      }
      if (lineUserId && hasInspectionState(lineUserId)) {
        if (event.message.type !== 'image') return null;
        return inspectHandler.handleImageMessage(event);
      }
      if (event.message.type === 'file') return null;
      const depositState = lineUserId ? getDepositState(lineUserId) : null;
      if (depositState && depositState.status === DEPOSIT_STATUS.AWAITING_SLIP) {
        return depositHandler.handleImageMessage(event);
      }
      return handleImageMessage(event);
    }

    // Support text and image events
    const text = event.message && event.message.type === 'text' ? event.message.text : '';
    const lower = String(text || '').trim().toLowerCase();

    // Commands
    if (lower === 'คำสั่ง' || lower === 'help') {
      return replyOrPush({ replyToken: event.replyToken, messages: [commandFlex()] });
    }

    if (/^สาขา\s+\d+$/i.test(text.trim())) {
      console.log('🔗 Routing to branch LINE group link');
      return linkHandler.handleBranchLink(event);
    }

    if (/^แอดมิน\s+\d+$/i.test(text.trim())) {
      console.log('🔗 Routing to admin LINE user link');
      return linkHandler.handleAdminLink(event);
    }

    if (/^(?:พนักงาน|register)\s+\d+/i.test(text)) {
      console.log('🔗 Routing to register handler');
      return registerHandler.handle(event);
    }

    if (lower.includes('เงินเดือน')) {
      console.log('💵 Routing to payroll self-service');
      return employeeHandler.handlePayroll(event);
    }

    if (lower.includes('หนังสือเตือน')) {
      console.log('📄 Routing to warning self-service');
      return employeeHandler.handleWarning(event);
    }

    if (lower.includes('แจ้งเตือน') || lower.includes('มาสาย') || lower.includes('ขาดงาน')) {
      console.log('⚠️ Routing to attendance alert self-service');
      return employeeHandler.handleAttendanceAlert(event);
    }

    if (isOpenShopCommand(text)) {
      console.log('🚪 Routing to open shop handler');
      return openHandler.handle(event);
    }

    if (isCloseShopCommand(text)) {
      console.log('🌙 Routing to close shop handler');
      const closeHandler = require('./flows/close/handler');
      return closeHandler.handle(event);
    }

    if (
      event.source &&
      event.source.userId &&
      hasLeaveState(event.source.userId) &&
      (lower === 'เสร็จ' || lower === 'ข้าม' || lower === 'ยืนยันส่ง' || lower === 'ยกเลิก' || lower.includes('วันที่เริ่มลา'))
    ) {
      console.log('🏖️ Routing to active leave flow');
      return leaveHandler.handle(event);
    }

    if (lower === 'ตรวจเสร็จ' || lower === 'ยืนยันส่ง') {
      console.log('🔍 Routing to active inspect flow');
      return inspectHandler.handle(event);
    }

if (
  lower.includes('ยืนยัน') ||
  lower === 'บันทึกยอดขาย'
) {
  console.log('✅ Routing to sales confirmation');

  const { handleConfirmation } = require('./flows/sales/handler');

  return handleConfirmation && handleConfirmation(event);
}

    if (lower.includes('ตรวจร้าน')) {
      console.log('🔍 Routing to inspect handler');
      return inspectHandler.handle(event);
    }

    if (lower.includes('ยอดขาย')) {
      console.log('💰 Routing to sales handler');
      return handleTextMessage(event);
    }

    if (lower.includes('ส่งรูป') || lower.includes('อัพรูป') || lower.includes('อัปโหลดรูป')) {
      console.log('📤 Routing to sales upload prompt');
      return handleUploadPrompt && handleUploadPrompt(event);
    }

    if (lower.includes('แก้ไข')) {
      console.log('✏️ Routing to sales edit');
      return handleEditFlow && handleEditFlow(event);
    }

    if (lower.includes('ฝาก') || lower.includes('ฝากเงิน')) {
      console.log('🏧 Routing to deposit handler');
      return depositHandler.handle(event);
    }

    if (lower.includes('ขอลา') || lower.includes('ลา')) {
      console.log('🏖️ Routing to leave handler');
      return leaveHandler.handle(event);
    }

    console.log('⏭️ No matching handler, ignoring event');
    return null;
  } catch (err) {
    console.error('❌ Error in handleEvent:', err.message || err);
    throw err;
  }
}

module.exports = {
  handleEvent,
};
