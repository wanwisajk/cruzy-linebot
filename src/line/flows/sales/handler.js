const { parseSalesText } = require('./parser');
const { getFlowState, setFlowState, updateFlowState, appendFlowImage, FLOW_STATES } = require('./state');
const { createDraftSale, saveAttachments } = require('./service');
const { replyOrPush } = require('../../reply');
const branchRepo = require('../../../../backend/repositories/branch.repo');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');
const {
  salesSummaryFlex,
  totalMismatchFlex,
  managerApprovalFlex,
  salesNoticeFlex,
} = require('../../flex/salesFlex');

function salesImagePromptMessage() {
  return {
    type: 'text',
    text: 'ส่งรูปหลักฐาน 3 รูปได้เลย แล้วระบบจะสรุปยอดขายให้ตรวจอีกครั้งเมื่อรับครบ',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'cameraRoll', label: '📸 เลือกรูป' },
        },
        {
          type: 'action',
          action: { type: 'camera', label: '📷 ถ่ายรูป' },
        },
      ],
    },
  };
}

async function handleTextMessage(event) {
  const text = event.message.text || '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่สามารถระบุผู้ส่ง',
      subtitle: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ หากคุณใช้งานในห้องแชทนี้ โปรดรีสตาร์ทคำสั่งใหม่อีกครั้ง',
      buttonLabel: 'เริ่มใหม่',
      buttonText: 'ยอดขาย',
      color: '#B91C1C',
      altText: 'ไม่สามารถระบุผู้ส่ง',
    })] });
    return;
  }

  const actor = await resolveLineActor(lineUserId);
  const employee = actor && actor.employee ? actor.employee : null;
  const user = actor && actor.user ? actor.user : null;

  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ยังไม่พบพนักงานของผู้ส่ง',
      subtitle: 'ต้องเชื่อมกับ employees ก่อนบันทึกยอดขาย',
      message: 'ระบบต้องใช้ employees.id เพื่อบันทึกลง sales.submitted_by กรุณาผูก LINE ด้วยคำสั่ง พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      buttonLabel: 'วิธีผูก',
      buttonText: 'พนักงาน <รหัสพนักงาน>',
      color: '#B91C1C',
      altText: 'ยังไม่พบพนักงานของผู้ส่ง',
    })] });
    return;
  }

  const submitterName = getDisplayName(employee, user, actor && actor.name, lineUserId);
  const submitterIdentity = actor ? actor.type : null;
  const submitterId = actor ? actor.id : null;
  const parsed = parseSalesText(text);
  const context = await resolveBranchFromEvent(event, text, { employeeId: employee ? employee.id : null });
  const branch = context.branch || (parsed.branch_code ? await branchRepo.findByCode(parsed.branch_code) : null);

  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่พบสาขา',
      subtitle: 'กรุณากำหนดสาขากลุ่มก่อน',
      message: 'สาขายังไม่ถูกผูกกับกลุ่มนี้ โปรดใช้คำสั่ง: สาขา <id> หรือพิมพ์ ยอดขาย CCA',
      buttonLabel: 'สาขา CCA',
      buttonText: 'สาขา CCA',
      color: '#EA580C',
      altText: 'ไม่พบสาขา',
    })] });
    return;
  }

  // Validate totals before creating any state
  const calculatedTotal = Number(parsed.cash_amount || 0) + Number(parsed.credit_amount || 0) + Number(parsed.transfer_amount || 0);
  const enteredTotal = Number(parsed.total_sales || 0);
  if (calculatedTotal !== enteredTotal) {
    await replyOrPush({ replyToken: event.replyToken, messages: [ totalMismatchFlex({
      cash: parsed.cash_amount,
      credit: parsed.credit_amount,
      transfer: parsed.transfer_amount,
      calculatedTotal,
      enteredTotal,
    }) ] });
    return;
  }

  // เริ่มต้น State หลังตรวจยอดสำเร็จ แล้วรอรูปหลักฐานทันที
  setFlowState(lineUserId, {
    status: FLOW_STATES.AWAITING_IMAGES,
    branch_id: branch.id,
    branch_code: branch.code,
    line_group_id: context.lineGroupId,
    line_user_id: lineUserId,
    message_text: text,
    submitted_at: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    images: [],
    imageSummaryShown: false,
    parsed_data: parsed,
    employee_id: employee ? employee.id : null,
    submitter_id: submitterId,
    submitter_identity: submitterIdentity,
    submitter_name: submitterName,
    replyToken: event.replyToken,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [salesImagePromptMessage()],
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
  const nextState = appendFlowImage(lineUserId, {
    message_id: event.message.id,
    received_at: new Date().toISOString(),
  });
  if (!nextState) return;

  const imageCount = (nextState.images || []).length;
  console.log('📸 Sales image received:', { lineUserId, imageCount, messageId: event.message.id });
  const shouldShowFinalReview = imageCount >= 3 && !nextState.imageSummaryShown;

  if (shouldShowFinalReview) {
    const updatedState = updateFlowState(lineUserId, {
      imageSummaryShown: true,
      status: FLOW_STATES.AWAITING_FINAL_CONFIRMATION,
    });

    await replyOrPush({
      replyToken: event.replyToken,
      messages: [
        salesSummaryFlex({
          branchCode: updatedState.branch_code,
          submitterName: updatedState.submitter_name,
          cash: updatedState.parsed_data.cash_amount,
          credit: updatedState.parsed_data.credit_amount,
          transfer: updatedState.parsed_data.transfer_amount,
          total: updatedState.parsed_data.total_sales,
          imageCount,
        })
      ],
    });
    return;
  }

}

async function handleUploadPrompt(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่สามารถระบุผู้ส่ง',
      subtitle: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ ถ้าคุณใช้งานในห้องแชทนี้ โปรดพิมพ์คำสั่งยอดขายอีกครั้ง',
      buttonLabel: 'กลับไปที่หน้าหลัก',
      buttonText: 'ยอดขาย',
      color: '#B91C1C',
      altText: 'ไม่สามารถระบุผู้ส่ง',
    })] });
    return;
  }

  const flowState = getFlowState(lineUserId);
  if (!flowState) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ต้องเริ่มรายงานยอดขายก่อน',
      subtitle: 'ยังไม่มีรายการในระบบ',
      message: 'กรุณาพิมพ์ยอดขายใหม่ก่อนส่งรูปหลักฐาน แล้วระบบจะรอรับรูปให้ครบ 3 รูปและสรุปยอดให้อัตโนมัติ',
      buttonLabel: 'เริ่มรายงานยอดขาย',
      buttonText: 'ยอดขาย',
      color: '#2563EB',
      altText: 'เริ่มรายงานยอดขาย',
    })] });
    return;
  }

  if (flowState.status === FLOW_STATES.AWAITING_CONFIRMATION) {
    await updateFlowState(lineUserId, { status: FLOW_STATES.AWAITING_IMAGES });
  } else if (flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'รายการนี้อยู่ขั้นตอนสรุปแล้ว กรุณากดยืนยันส่งหรือแก้ไขข้อมูล' }] });
    return;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [salesImagePromptMessage()],
  });
}

async function handleConfirmation(event) {
  const text = event.message.text || '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่สามารถระบุผู้ส่ง',
      subtitle: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ หากคุณใช้งานในห้องแชทนี้ โปรดพิมพ์คำสั่งยอดขายใหม่อีกครั้ง',
      buttonLabel: 'เริ่มใหม่',
      buttonText: 'ยอดขาย',
      color: '#B91C1C',
      altText: 'ไม่สามารถระบุผู้ส่ง',
    })] });
    return;
  }

  const flowState = getFlowState(lineUserId);
  if (!flowState) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่พบรายการ',
      subtitle: 'ไม่มียอดขายที่รอยืนยัน',
      message: 'หากคุณเพิ่งเริ่มใช้งาน กรุณาพิมพ์ยอดขายใหม่ก่อน แล้วระบบจะรอรับรูปตรวจสอบ',
      buttonLabel: 'เริ่มรายงานยอดขาย',
      buttonText: 'ยอดขาย',
      color: '#2563EB',
      altText: 'ไม่พบรายการยอดขาย',
    })] });
    return;
  }

  const wantsFinalSave = text.trim() === 'บันทึกยอดขาย' || /ยืนยัน(?:การส่ง|ส่ง)?/i.test(text.trim());

  // Handle final save when user confirms from the sales summary.
  if (flowState.status === FLOW_STATES.AWAITING_FINAL_CONFIRMATION && wantsFinalSave) {
    const calc = Number(flowState.parsed_data.cash_amount || 0) + Number(flowState.parsed_data.credit_amount || 0) + Number(flowState.parsed_data.transfer_amount || 0);
    const entered = Number(flowState.parsed_data.total_sales || 0);
    if (calc !== entered) {
      await replyOrPush({ replyToken: event.replyToken, messages: [ totalMismatchFlex({
        cash: flowState.parsed_data.cash_amount,
        credit: flowState.parsed_data.credit_amount,
        transfer: flowState.parsed_data.transfer_amount,
        calculatedTotal: calc,
        enteredTotal: entered,
      }) ] });
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
        submittedAt: flowState.submitted_at,
        source: 'line',
        lineGroupId: flowState.line_group_id,
        lineUserId: flowState.line_user_id,
        submitterIdentity: flowState.submitter_identity,
        submitterId: flowState.submitter_id,
      });

      const messageIds = flowState.images.map(img => img.message_id);
      const attachments = await saveAttachments(sale.id, messageIds);
      const attachmentUrls = (attachments || [])
        .map((item) => item && item.file_url)
        .filter(Boolean);

      // เคลียร์ Flow ออกจาก Memory
      setFlowState(lineUserId, null);

      // ส่ง flex พร้อมปุ่มอนุมัติ/ปฏิเสธทันทีในกลุ่มเดียวกัน
      await replyOrPush({
        replyToken: event.replyToken,
        messages: [ managerApprovalFlex({
          saleId: sale.id,
          branchCode: flowState.branch_code,
          submitterName: flowState.submitter_name,
          cash: flowState.parsed_data.cash_amount,
          credit: flowState.parsed_data.credit_amount,
          transfer: flowState.parsed_data.transfer_amount,
          total: flowState.parsed_data.total_sales,
          imageCount: messageIds.length,
          attachmentUrls,
        }) ]
      });

      return;
    } catch (error) {
      if (error.code === '23505') {
        await replyOrPush({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `มียอดขาย ${flowState.branch_code} ในวันนี้แล้ว\nกรุณาแก้ไขหรือลองใหม่วันหลัง` }],
        });
        return;
      }
      throw error;
    }
  }

  const confirmMatch = text.match(/(?:ยืนยัน|ส่งรูป(?:หลักฐาน)?)(?:\s+(\S+))?/i);
  const branchCodeFromText = confirmMatch[1] ? confirmMatch[1].toUpperCase() : null;
  if (confirmMatch && branchCodeFromText && branchCodeFromText !== flowState.branch_code) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [salesNoticeFlex({
        title: 'รหัสสาขาไม่ตรงกัน',
        subtitle: `สาขาที่ต้องการคือ ${flowState.branch_code}`,
        message: 'โปรดพิมพ์คำสั่งใหม่ด้วยรหัสสาขาที่ถูกต้องหรือกดปุ่มส่งรูปหลักฐานอีกครั้ง',
        buttonLabel: `ส่งรูป ${flowState.branch_code}`,
        buttonText: `ส่งรูป ${flowState.branch_code}`,
        color: '#EA580C',
        altText: 'รหัสสาขาไม่ตรงกัน',
      })] });
    return;
  }


  if (flowState.status === FLOW_STATES.AWAITING_CONFIRMATION) {
    if (!confirmMatch) {
      await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
        title: 'รอยืนยันรูปหลักฐาน',
        subtitle: 'กดปุ่มหรือพิมพ์เพื่อส่งรูป',
        message: 'เพื่อดำเนินการต่อ กรุณากดปุ่ม ส่งรูปหลักฐาน หรือพิมพ์คำสั่ง ส่งรูปหลักฐาน',
        buttonLabel: 'ส่งรูปหลักฐาน',
        buttonText: 'ส่งรูปหลักฐาน',
        color: '#2563EB',
        altText: 'รอบันทึกรูปหลักฐาน',
      })] });
      return;
    }

    await updateFlowState(lineUserId, { status: FLOW_STATES.AWAITING_IMAGES });
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [salesImagePromptMessage()],
    });
    return;
  }

  if (flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่มีรายการรอการยืนยัน',
      subtitle: 'คุณยังไม่ได้ส่งรูปครบถ้วน',
      message: 'กรุณาส่งรูปหลักฐานอย่างน้อย 3 รูป เพื่อให้ระบบสรุปและยืนยันยอดขายให้เสร็จสมบูรณ์',
      buttonLabel: 'ส่งรูปหลักฐาน',
      buttonText: 'ส่งรูปหลักฐาน',
      color: '#2563EB',
      altText: 'ไม่มีรายการรอการยืนยัน',
    })] });
    return;
  }

  const imageCount = (flowState.images || []).length;
  console.log('✅ Sales confirmation image count:', { lineUserId, imageCount, status: flowState.status, text });
  if (imageCount < 3) {
    await replyOrPush({
      replyToken: event.replyToken,
      messages: [salesNoticeFlex({
        title: `ได้รับรูป ${imageCount} รูป`,
        subtitle: 'ยังไม่ครบ 3 รูป',
        message: 'กรุณาส่งรูปหลักฐานเพิ่มให้ครบ 3 รูป แล้วระบบจะสรุปยอดให้อัตโนมัติ',
        buttonLabel: 'ส่งเพิ่ม',
        buttonText: 'ส่งรูปหลักฐาน',
        color: '#2563EB',
        altText: 'รอยอดรูปหลักฐาน',
      })] });
    return;
  }

  // เมื่อครบ 3 รูปแล้วแต่ยังไม่ได้แสดงสรุป ให้แสดงสรุปยอดขายพร้อมปุ่มยืนยันส่ง
  await updateFlowState(lineUserId, { status: FLOW_STATES.AWAITING_FINAL_CONFIRMATION });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [
      salesSummaryFlex({
        branchCode: flowState.branch_code,
        submitterName: flowState.submitter_name,
        cash: flowState.parsed_data.cash_amount,
        credit: flowState.parsed_data.credit_amount,
        transfer: flowState.parsed_data.transfer_amount,
        total: flowState.parsed_data.total_sales,
        imageCount,
      })
    ],
  });
  return;
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
