const { parseSalesText } = require('./parser');
const { getFlowState, setFlowState, updateFlowState, FLOW_STATES } = require('./state');
const { createDraftSale, updateSaleStatus, saveAttachments } = require('./service');
const { replyOrPush } = require('../../reply');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const branchRepo = require('../../../../backend/repositories/branch.repo');

async function handleTextMessage(event) {
  const text = event.message.text || '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่สามารถระบุผู้ส่ง' }] });
    return;
  }

  const employee = await employeeRepo.findByLineUserId(lineUserId);
  const parsed = parseSalesText(text);

  // if no branch code in text, skip
  if (!parsed.branch_code) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบรหัสสาขา กรุณาพิมพ์: #ยอดขาย ONM' }] });
    return;
  }

  // find branch by code
  const branch = await branchRepo.findByCode(parsed.branch_code);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบสาขา: ${parsed.branch_code}` }] });
    return;
  }

  // Store in state WITHOUT creating DB record yet
  setFlowState(lineUserId, {
    status: FLOW_STATES.AWAITING_IMAGES,
    branch_id: branch.id,
    branch_code: parsed.branch_code,
    images: [],
    parsed_data: parsed,
    employee_id: employee ? employee.id : null,
    replyToken: event.replyToken,
  });

  // reply: ask for images
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `พร้อมบันทึกยอดขาย ${branch.code}\n\nกรุณาส่งรูปยอดขาย (กี่รูปก็ได้)\nแล้วพิมพ์: ยืนยัน ${branch.code}`,
      },
    ],
  });
}

async function handleImageMessage(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่สามารถระบุผู้ส่ง' }] });
    return;
  }

  const flowState = getFlowState(lineUserId);

  if (!flowState || flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบการรายงานยอดขายที่กำลังอยู่ในระหว่างดำเนิน' }] });
    return;
  }

  // Store image message id
  flowState.images.push({
    message_id: event.message.id,
    received_at: new Date().toISOString(),
  });

  updateFlowState(lineUserId, flowState);

  const imageCount = flowState.images.length;
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: `ได้รับรูปที่ ${imageCount} แล้ว\n\nส่งรูปต่ออีกหรือพิมพ์: ยืนยัน ${flowState.branch_code}` }],
  });
}

async function handleConfirmation(event) {
  const text = event.message.text || '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่สามารถระบุผู้ส่ง' }] });
    return;
  }

  const flowState = getFlowState(lineUserId);
  if (!flowState || flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบการรายงานยอดขายที่รอการยืนยัน' }] });
    return;
  }

  // Extract branch code from confirmation text (e.g., "ยืนยัน" or "ยืนยัน ONM")
  // Allow just "ยืนยัน" without branch code, or with branch code for verification
  const confirmMatch = text.match(/ยืนยัน(?:\s+(\S+))?/i);
  
  if (!confirmMatch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์: ยืนยัน' }] });
    return;
  }

  // If branch code is provided, verify it matches
  const branchCodeFromText = confirmMatch[1] ? confirmMatch[1].toUpperCase() : null;
  if (branchCodeFromText && branchCodeFromText !== flowState.branch_code) {
    await replyOrPush({ 
      replyToken: event.replyToken, 
      messages: [{ 
        type: 'text', 
        text: `รหัสสาขาไม่ตรงกัน กรุณาพิมพ์: ยืนยัน ${flowState.branch_code}` 
      }] 
    });
    return;
  }

  const imageCount = flowState.images.length;
  if (imageCount === 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาส่งรูปอย่างน้อย 1 รูป' }] });
    return;
  }

  try {
    // Create draft sale in DB now
    const sale = await createDraftSale({
      branchId: flowState.branch_id,
      date: flowState.parsed_data.date,
      cashAmount: flowState.parsed_data.cash_amount,
      creditAmount: flowState.parsed_data.credit_amount,
      transferAmount: flowState.parsed_data.transfer_amount,
      totalSales: flowState.parsed_data.total_sales,
      rawText: flowState.parsed_data.raw_text,
      submittedBy: flowState.employee_id,
    });

    // Save attachments (images)
    const messageIds = flowState.images.map(img => img.message_id);
    await saveAttachments(sale.id, messageIds);

    // Clear flow state
    setFlowState(lineUserId, null);

    // Reply with confirmation
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `ยืนยันยอดขาย ${flowState.branch_code} เรียบร้อย\nID: ${sale.id}\nรูป: ${imageCount} รูป\n\nรอการอนุมัติจากผู้จัดการ`,
        },
      ],
    });
  } catch (error) {
    // If error is duplicate key constraint, inform user
    if (error.code === '23505') {
      await replyOrPush({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: `มียอดขาย ${flowState.branch_code} ในวันนี้แล้ว\nกรุณาแก้ไขหรือลองใหม่วันหลัง`,
        }],
      });
      return;
    }
    throw error;
  }
}

module.exports = { handleTextMessage, handleImageMessage, handleConfirmation };
