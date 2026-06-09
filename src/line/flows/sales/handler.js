const { parseSalesText } = require('./parser');
const { getFlowState, setFlowState, updateFlowState, FLOW_STATES } = require('./state');
const { createDraftSale, saveAttachments } = require('./service');
const { replyOrPush } = require('../../reply');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const branchRepo = require('../../../../backend/repositories/branch.repo');
const {
  salesSummaryFlex,
  imageReceivedFlex,
  successFlex
} = require('../../flex/salesFlex');

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

  if (!parsed.branch_code) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบรหัสสาขา กรุณาพิมพ์: #ยอดขาย ONM' }] });
    return;
  }

  const branch = await branchRepo.findByCode(parsed.branch_code);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบสาขา: ${parsed.branch_code}` }] });
    return;
  }

  // เริ่มต้น State ให้อยู่ในขั้นตอนรอการยืนยันสรุปยอดก่อน
  setFlowState(lineUserId, {
    status: FLOW_STATES.AWAITING_CONFIRMATION,
    branch_id: branch.id,
    branch_code: parsed.branch_code,
    images: [],
    parsed_data: parsed,
    employee_id: employee ? employee.id : null,
    replyToken: event.replyToken,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      salesSummaryFlex({
        branchCode: branch.code,
        cash: parsed.cash_amount,
        credit: parsed.credit_amount,
        transfer: parsed.transfer_amount,
        total: parsed.total_sales,
      }),
    ],
  });
}

async function handleImageMessage(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  // 1. ถ้าแกะสิทธิ์ระบุตัวตนไม่ได้ ให้เงียบไปเลย ไม่ต้องพ่น text กวนหน้าแชท
  if (!lineUserId) return;

  const flowState = getFlowState(lineUserId);

  // 2. 🔥 ปรับตรงนี้: ถ้าพนักงานส่งรูปเข้ามาเฉยๆ โดยที่ไม่ได้กำลังทำ Flow รายงานยอดขาย
  // ให้ return ออกไปเงียบๆ ทันที ไม่ต้องส่งข้อความไปขัดจังหวะการคุยปกติ
  if (!flowState || flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    return;
  }

  // 3. บันทึกข้อมูลรูปภาพสะสมเข้าใน State Memory เงียบๆ
  flowState.images.push({
    message_id: event.message.id,
    received_at: new Date().toISOString(),
  });

  updateFlowState(lineUserId, flowState);

  const imageCount = flowState.images.length;

  // 4. 🔥 ตรวจสอบจำนวนรูป: เด้งหน้าจอสรุปให้กดส่งงาน เมื่อรูปครบ 3 รูปเท่านั้น
  if (imageCount === 3) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [
        imageReceivedFlex(flowState.branch_code, imageCount),
      ],
    });
  }
}

async function handleUploadPrompt(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่สามารถระบุผู้ส่ง' }] });
    return;
  }

  const flowState = getFlowState(lineUserId);
  if (!flowState || flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์รายงานยอดขายใหม่ก่อนส่งรูปภาพ' }] });
    return;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'กรุณาส่งรูปหลักฐานได้เลย เมื่อส่งแล้วระบบจะแจ้งจำนวนรูปที่ได้รับในระบบ' }],
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
  if (!flowState) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบยอดขายที่รอการยืนยัน' }] });
    return;
  }

  const confirmMatch = text.match(/ยืนยัน(?:\s+(\S+))?/i);
  const branchCodeFromText = confirmMatch[1] ? confirmMatch[1].toUpperCase() : null;
  if (confirmMatch && branchCodeFromText && branchCodeFromText !== flowState.branch_code) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `รหัสสาขาไม่ตรงกัน กรุณาพิมพ์: ยืนยัน ${flowState.branch_code}` }],
    });
    return;
  }

  if (flowState.status === FLOW_STATES.AWAITING_CONFIRMATION) {
    if (!confirmMatch) {
      await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณากดปุ่มหรือพิมพ์: ยืนยัน' }] });
      return;
    }

    await updateFlowState(lineUserId, { status: FLOW_STATES.AWAITING_IMAGES });
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'ยืนยันยอดขายเรียบร้อยแล้ว กรุณาส่งรูปหลักฐาน 3 รูปขึ้นไป เมื่อส่งครบแล้วให้พิมพ์: ยืนยัน',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'cameraRoll',
                  label: '📸 ส่งรูปภาพ'
                }
              }
            ]
          }
        }
      ],
    });
    return;
  }

  if (flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบยอดขายที่รอการยืนยัน หรือท่านยังไม่ได้ส่งรูปภาพหลักฐาน' }] });
    return;
  }

  const imageCount = flowState.images.length;
  if (imageCount === 0) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาส่งรูปหลักฐานอย่างน้อย 1 รูปก่อนกดยืนยันสำเร็จ' }] });
    return;
  }

  try {
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

    const messageIds = flowState.images.map(img => img.message_id);
    await saveAttachments(sale.id, messageIds);

    // เคลียร์ Flow ออกจาก Memory
    setFlowState(lineUserId, null);

    await replyOrPush({
      replyToken: event.replyToken,
      messages: [
        successFlex({
          branchCode: flowState.branch_code,
          saleId: sale.id,
          imageCount: imageCount
        })
      ],
    });
  } catch (error) {
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

// 🔥 เพิ่มฟังก์ชันยกเลิก / แก้ไข Flow ข้อมูล
async function handleEditFlow(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) return;

  const flowState = getFlowState(lineUserId);
  if (!flowState) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบข้อมูลยอดขายที่กำลังดำเนินการอยู่' }] });
    return;
  }

  setFlowState(lineUserId, null);
  await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ล้างข้อมูลเดิมเรียบร้อยแล้ว กรุณาพิมพ์รายงานยอดขายเข้ามาใหม่อีกครั้ง' }] });
}
module.exports = { 
  handleTextMessage, 
  handleImageMessage, 
  handleUploadPrompt,
  handleConfirmation,
  handleEditFlow 
};