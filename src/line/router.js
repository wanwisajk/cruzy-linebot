const openHandler = require('./flows/open/handler');
const inspectHandler = require('./flows/inspect/handler');
const registerHandler = require('./flows/register/handler');
const { handleTextMessage, handleImageMessage, handleUploadPrompt, handleEditFlow } = require('./flows/sales/handler');

async function handleEvent(event) {
  try {
    console.log('📨 Event received:', {
      type: event.type,
      message_type: event.message?.type,
      text: event.message?.text?.substring(0, 50),
    });

    // handle postbacks
    if (event.type === 'postback') {
      const postbackHandler = require('./postback');
      return postbackHandler.handlePostback(event);
    }

    // Handle image events for sales flow
    if (event.message && event.message.type === 'image') {
      return handleImageMessage(event);
    }

    // Support text and image events
    const text = event.message && event.message.type === 'text' ? event.message.text : '';
    const lower = String(text || '').trim().toLowerCase();

    // Commands
    if (/^(?:สมัคร|register)\s+\d+/i.test(text)) {
      console.log('🔗 Routing to register handler');
      return registerHandler.handle(event);
    }

    if (lower.includes('เปิดร้าน')) {
      console.log('🚪 Routing to open shop handler');
      return openHandler.handle(event);
    }

    if (lower.includes('ตรวจร้าน')) {
      console.log('🔍 Routing to inspect handler');
      return inspectHandler.handle(event);
    }

    if (lower.includes('#ยอดขาย')) {
      console.log('💰 Routing to sales handler');
      return handleTextMessage(event);
    }

    if (lower.includes('ส่งรูป') || lower.includes('อัพรูป') || lower.includes('อัปโหลดรูป')) {
      console.log('📤 Routing to sales upload prompt');
      return handleUploadPrompt && handleUploadPrompt(event);
    }

if (
  lower.includes('ยืนยัน') ||
  lower === 'บันทึกยอดขาย'
) {
  console.log('✅ Routing to sales confirmation');

  const { handleConfirmation } = require('./flows/sales/handler');

  return handleConfirmation && handleConfirmation(event);
}

    if (lower.includes('แก้ไข')) {
      console.log('✏️ Routing to sales edit');
      return handleEditFlow && handleEditFlow(event);
    }

    if (lower.includes('ฝาก') || lower.includes('ฝากเงิน')) {
      console.log('🏧 Routing to deposit handler');
      const depositHandler = require('./flows/deposit/handler');
      return depositHandler.handle(event);
    }

    if (lower.includes('ขอลา') || lower.includes('ลา')) {
      console.log('🏖️ Routing to leave handler');
      const leaveHandler = require('./flows/leave/handler');
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
