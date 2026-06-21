const openHandler = require('./flows/open/handler');
const closeHandler = require('./flows/close/handler');
const inspectHandler = require('./flows/inspect/handler');
const registerHandler = require('./flows/register/handler');
const { handleTextMessage, handleImageMessage, handleUploadPrompt } = require('./flows/sales/handler');
const { getFlowState, FLOW_STATES } = require('./flows/sales/state');
const depositHandler = require('./flows/deposit/handler');
const { getDepositState, DEPOSIT_STATUS } = require('./flows/deposit/state');
const commandFlex = require('./flex/commandFlex');
const employeeHandler = require('./flows/employee/handler');
const { replyOrPush } = require('./reply');
const linkHandler = require('./flows/link/handler');
const { logInboundLineEvent } = require('./utils/audit');
const { hasLeaveState } = require('./flows/leave/state');
const leaveHandler = require('./flows/leave/handler');
const scheduleHandler = require('./flows/schedule/handler');

function isOpenShopCommand(text) {
  return /^#\s*เปิด\s*ร้าน(?:\s|$)/i.test(String(text || '').trim());
}

function isPrivateEvent(event) {
  const source = event.source || {};
  return !source.groupId && !source.roomId;
}

function isCloseShopCommand(text) {
  return /^#\s*(?:ปิด\s*ร้าน|ปิด้ราน|ปิดราน)(?:\s|$)/i.test(String(text || '').trim());
}

function isLeaveTypeText(text) {
  return ['ลาป่วย', 'ลางาน', 'ลากิจ', 'ลาประจำปี', 'ลาพักร้อน'].includes(String(text || '').trim());
}

function isLeaveStartCommand(text) {
  return /^#\s*(?:ขอลางาน|ขอลา|แจ้งลางาน)(?:\s|$)/i.test(String(text || '').trim());
}

function isDepositCommand(text) {
  return /^#\s*ฝากเงิน(?:\s|$)/i.test(String(text || '').trim());
}

function isSalesCommand(text) {
  return /^#\s*ยอดขาย(?:\s|$)/i.test(String(text || '').trim());
}

function isScheduleCommand(text) {
  return /^#\s*(?:ตาราง|ตารางงาน|ตารางคนขาด|schedule)(?:\s|$)/i.test(String(text || '').trim());
}

function isInspectCommand(text) {
  return /^#\s*ตรวจ\s*ร้าน(?:\s|$)/i.test(String(text || '').trim());
}

function isPayrollCommand(text) {
  return /^#\s*เงินเดือน(?:\s|$)/i.test(String(text || '').trim());
}

function isWarningCommand(text) {
  return /^#\s*หนังสือเตือน(?:\s|$)/i.test(String(text || '').trim());
}

function isAttendanceAlertCommand(text) {
  return /^#\s*(?:แจ้งเตือน|มาสาย|ขาดงาน)(?:\s|$)/i.test(String(text || '').trim());
}

function isLeaveStatusCommand(text) {
  return /^#\s*(?:ติดตามสถานะ|เช็คสถานะ|ตรวจสถานะ|สถานะลา|ติดตามลา)(?:\s|$)/i.test(String(text || '').trim());
}

function isCommandListCommand(text) {
  return /^#\s*(?:คำสั่ง|help)(?:\s|$)/i.test(String(text || '').trim());
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
      if (lineUserId && isPrivateEvent(event) && hasLeaveState(lineUserId)) {
        return leaveHandler.handleAttachmentMessage(event);
      }
      if (event.message.type === 'file') return null;
      const depositState = lineUserId ? getDepositState(lineUserId) : null;
      if (
        depositState &&
        (
          depositState.status === DEPOSIT_STATUS.AWAITING_SLIP ||
          depositState.status === DEPOSIT_STATUS.AWAITING_CONFIRMATION
        )
      ) {
        return depositHandler.handleImageMessage(event);
      }
      if (closeHandler.hasActiveCloseImageRequest(event)) {
        return closeHandler.handleImageMessage(event);
      }
      if (openHandler.hasActiveOpenImageRequest(event)) {
        return openHandler.handleImageMessage(event);
      }
      const salesState = lineUserId ? getFlowState(lineUserId) : null;
      if (salesState && salesState.status === FLOW_STATES.AWAITING_IMAGES) {
        return handleImageMessage(event);
      }
      await closeHandler.handleImageMessage(event);
      await openHandler.handleImageMessage(event);
      return handleImageMessage(event);
    }

    // Support text and image events
    const text = event.message && event.message.type === 'text' ? event.message.text : '';
    const lower = String(text || '').trim().toLowerCase();

    // Commands
    if (isCommandListCommand(text)) {
      return replyOrPush({ replyToken: event.replyToken, messages: [commandFlex()] });
    }

    if (/^#\s*สาขา\s+[A-Za-z][A-Za-z0-9_-]{1,15}$/i.test(text.trim())) {
      console.log('🔗 Routing to branch LINE group link');
      return linkHandler.handleBranchLink(event);
    }

    if (/^#\s*แอดมิน\s+\S{1,255}$/i.test(text.trim())) {
      console.log('🔗 Routing to admin LINE user link');
      return linkHandler.handleAdminLink(event);
    }

    if (/^#\s*(?:พนักงาน|register)\s+\S{1,255}$/i.test(text.trim())) {
      console.log('🔗 Routing to register handler');
      return registerHandler.handle(event);
    }

    if (isScheduleCommand(text)) {
      console.log('📅 Routing to schedule handler');
      return scheduleHandler.handle(event);
    }

    if (isPayrollCommand(text)) {
      console.log('💵 Routing to payroll self-service');
      return employeeHandler.handlePayroll(event);
    }

    if (isWarningCommand(text)) {
      console.log('📄 Routing to warning self-service');
      return employeeHandler.handleWarning(event);
    }

    if (isAttendanceAlertCommand(text)) {
      console.log('⚠️ Routing to attendance alert self-service');
      return employeeHandler.handleAttendanceAlert(event);
    }

    if (isLeaveStatusCommand(text)) {
      if (!isPrivateEvent(event)) {
        return replyOrPush({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'เช็คสถานะคำขอลา กรุณาพิมพ์ในแชทส่วนตัวกับบอท' }],
        });
      }
      console.log('🏖️ Routing to leave status tracking');
      return leaveHandler.handle(event);
    }

    if (isOpenShopCommand(text)) {
      console.log('🚪 Routing to open shop handler');
      return openHandler.handle(event);
    }

    if (isCloseShopCommand(text)) {
      console.log('🌙 Routing to close shop handler');
      return closeHandler.handle(event);
    }

    if (
      event.source &&
      event.source.userId &&
      isPrivateEvent(event) &&
      hasLeaveState(event.source.userId) &&
      (
        lower === 'เสร็จ' ||
        lower === 'ข้าม' ||
        lower === 'ยืนยันส่ง' ||
        lower === 'ยกเลิก' ||
        lower.includes('แก้ไข') ||
        lower.includes('วันที่เริ่มลา') ||
        isLeaveTypeText(text)
      )
    ) {
      console.log('🏖️ Routing to active leave flow');
      return leaveHandler.handle(event);
    }

    const activeSalesState = event.source && event.source.userId ? getFlowState(event.source.userId) : null;
    if (
      activeSalesState &&
      (
        lower === 'ส่งรูปเสร็จ' ||
        lower === 'เสร็จ' ||
        lower === 'ยกเลิก' ||
        lower === 'ยืนยันส่ง' ||
        lower === 'บันทึกยอดขาย' ||
        lower.includes('ส่งรูป') ||
        lower.includes('อัพรูป') ||
        lower.includes('อัปโหลดรูป') ||
        lower.includes('แก้ไข')
      )
    ) {
      console.log('💰 Routing to active sales flow');
      const { handleConfirmation } = require('./flows/sales/handler');
      return handleConfirmation && handleConfirmation(event);
    }

    const activeDepositState = event.source && event.source.userId ? getDepositState(event.source.userId) : null;
    if (
      activeDepositState &&
      (
        lower === 'ยกเลิก' ||
        lower.includes('แก้ไข') ||
        lower === 'ยืนยันส่ง' ||
        lower === 'ส่งรูป' ||
        lower === 'ส่งสลิป' ||
        lower === 'ส่งรูปสลิป' ||
        lower.includes('อัพรูป') ||
        lower.includes('อัปโหลดรูป')
      )
    ) {
      console.log('🏧 Routing to active deposit flow');
      return depositHandler.handleActiveTextMessage(event);
    }

    if (
      closeHandler.hasActiveCloseImageRequest(event) &&
      (lower === 'ยกเลิก' || lower.includes('แก้ไข'))
    ) {
      console.log('🌙 Routing to active close flow');
      return closeHandler.handleActiveTextMessage(event);
    }

    if (
      openHandler.hasActiveOpenImageRequest(event) &&
      (lower === 'ยกเลิก' || lower.includes('แก้ไข'))
    ) {
      console.log('🚪 Routing to active open flow');
      return openHandler.handleActiveTextMessage(event);
    }

    if (isInspectCommand(text)) {
      console.log('🔍 Routing to inspect handler');
      return inspectHandler.handle(event);
    }

    if (isSalesCommand(text)) {
      console.log('💰 Routing to sales handler');
      return handleTextMessage(event);
    }

    if (isDepositCommand(text)) {
      console.log('🏧 Routing to deposit handler');
      return depositHandler.handle(event);
    }

    if (isLeaveStartCommand(text)) {
      if (!isPrivateEvent(event)) return null;
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
