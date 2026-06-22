const { parseSalesText } = require('./parser');
const { getFlowState, setFlowState, updateFlowState, appendFlowImage, FLOW_STATES } = require('./state');
const { createDraftSale, saveAttachments } = require('./service');
const { replyOrPush } = require('../../reply');
const branchRepo = require('../../../../backend/repositories/branch.repo');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');
const { buildLineAudit } = require('../../utils/lineAudit');
const {
  salesSummaryFlex,
  totalMismatchFlex,
  managerApprovalFlex,
  salesNoticeFlex,
} = require('../../flex/salesFlex');

function salesImagePromptMessage() {
  return {
    type: 'text',
    text: 'ส่งรูปหลักฐานได้เลย จะส่งกี่รูปก็ได้ เมื่อครบแล้วพิมพ์ "ส่งรูปเสร็จ" เพื่อให้ระบบสรุปยอดขาย',
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
        {
          type: 'action',
          action: { type: 'message', label: 'แก้ไข', text: 'แก้ไขข้อมูล' },
        },
        {
          type: 'action',
          action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิก' },
        },
      ],
    },
  };
}

function isCancelCommand(text) {
  return /^ยกเลิก$/i.test(String(text || '').trim());
}

function isEditCommand(text) {
  return /แก้ไข/i.test(String(text || '').trim());
}

function isFinishImagesCommand(text) {
  return /^(?:ส่งรูปเสร็จ|เสร็จ)$/i.test(String(text || '').trim());
}

function isUploadCommand(text) {
  return /^(?:ส่งรูป|ส่งรูปหลักฐาน|อัพรูป|อัปโหลดรูป)$/i.test(String(text || '').trim());
}

function isFinalSaveCommand(text) {
  return String(text || '').trim() === 'บันทึกยอดขาย' || /ยืนยัน(?:การส่ง|ส่ง)?/i.test(String(text || '').trim());
}

function sumMoney(...amounts) {
  return amounts.reduce((sum, amount) => {
    const value = Number(amount || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function moneyEquals(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.005;
}

function hasSalesAmountData(parsed) {
  return Number(parsed.total_sales || 0) > 0 ||
    Number(parsed.cash_amount || 0) > 0 ||
    Number(parsed.credit_amount || 0) > 0 ||
    Number(parsed.transfer_amount || 0) > 0;
}

function buildSalesSummaryFromState(flowState, mode) {
  return salesSummaryFlex({
    branchCode: flowState.branch_code,
    submitterName: flowState.submitter_name,
    sellDate: flowState.parsed_data.date,
    cash: flowState.parsed_data.cash_amount,
    credit: flowState.parsed_data.credit_amount,
    transfer: flowState.parsed_data.transfer_amount,
    total: flowState.parsed_data.total_sales,
    drawerTotal: flowState.parsed_data.drawer_total,
    imageCount: (flowState.images || []).length,
    mode,
  });
}

async function handleTextMessage(event) {
  const text = event.message.text || '';
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!/^\s*#ยอดขาย(?:\s|$)/i.test(text)) {
    return null;
  }

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่สามารถระบุผู้ส่ง',
      subtitle: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ หากคุณใช้งานในห้องแชทนี้ โปรดรีสตาร์ทคำสั่งใหม่อีกครั้ง',
      buttonLabel: 'เริ่มใหม่',
      buttonText: '#ยอดขาย',
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
      message: 'ระบบต้องใช้ employees.id เพื่อบันทึกลง sales.submitted_by กรุณาผูก LINE ด้วยคำสั่ง #พนักงาน <รหัสพนักงาน> หรือกำหนด users.scope_type = employee และ users.scope_value = รหัสพนักงาน',
      buttonLabel: 'ดูคำสั่ง',
      buttonText: '#คำสั่ง',
      color: '#B91C1C',
      altText: 'ยังไม่พบพนักงานของผู้ส่ง',
    })] });
    return;
  }

  const submitterName = getDisplayName(employee, user, actor && actor.name, lineUserId);
  const submitterIdentity = actor ? actor.type : null;
  const submitterId = actor ? actor.id : null;
  const audit = buildLineAudit({
    lineUserId,
    lineGroupId: source.groupId || source.roomId || null,
    actor,
  });
  const parsed = parseSalesText(text);

  if (!hasSalesAmountData(parsed)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'กรุณาระบุยอดขาย',
      subtitle: 'ยังไม่มีตัวเลขให้บันทึก',
      message: 'พิมพ์ #ยอดขาย พร้อมยอดรวม เงินสด บัตร และโอน เช่น #ยอดขาย แล้วตามด้วยรายละเอียดตัวเลขในข้อความเดียวกัน',
      buttonLabel: 'ดูคำสั่ง',
      buttonText: '#คำสั่ง',
      color: '#2563EB',
      altText: 'กรุณาระบุยอดขาย',
    })] });
    return;
  }

  const context = await resolveBranchFromEvent(event, text, { employeeId: employee ? employee.id : null });
  const branch = context.branch || (parsed.branch_code ? await branchRepo.findByCode(parsed.branch_code) : null);

  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่พบสาขา',
      subtitle: 'กรุณากำหนดสาขากลุ่มก่อน',
      message: 'สาขายังไม่ถูกผูกกับกลุ่มนี้ โปรดใช้คำสั่ง: #สาขา <ตัวย่อสาขา> เช่น #สาขา CCA หรือพิมพ์ #ยอดขาย CCA',
      buttonLabel: 'ดูคำสั่ง',
      buttonText: '#คำสั่ง',
      color: '#EA580C',
      altText: 'ไม่พบสาขา',
    })] });
    return;
  }

  // Validate totals before creating any state
  const calculatedTotal = sumMoney(parsed.cash_amount, parsed.credit_amount, parsed.transfer_amount);
  const enteredTotal = Number(parsed.total_sales || 0);
  if (!moneyEquals(calculatedTotal, enteredTotal)) {
    await replyOrPush({ replyToken: event.replyToken, messages: [ totalMismatchFlex({
      cash: parsed.cash_amount,
      credit: parsed.credit_amount,
      transfer: parsed.transfer_amount,
      calculatedTotal,
      enteredTotal,
    }) ] });
    return;
  }

  // เริ่มต้น State หลังตรวจยอดสำเร็จ แล้วให้ส่งรูปก่อนแสดงสรุป
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
    audit_actor_type: audit.auditActorType,
    audit_actor_id: audit.auditActorId,
    audit_actor_name: audit.auditActorName,
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
}

async function handleUploadPrompt(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;

  if (!lineUserId) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ไม่สามารถระบุผู้ส่ง',
      subtitle: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ ถ้าคุณใช้งานในห้องแชทนี้ โปรดพิมพ์คำสั่ง #ยอดขาย อีกครั้ง',
      buttonLabel: 'กลับไปที่หน้าหลัก',
      buttonText: '#ยอดขาย',
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
      message: 'กรุณาพิมพ์ #ยอดขาย พร้อมรายละเอียดก่อนส่งรูปหลักฐาน แล้วระบบจะรอรับรูปทันที',
      buttonLabel: 'เริ่มรายงานยอดขาย',
      buttonText: '#ยอดขาย',
      color: '#2563EB',
      altText: 'เริ่มรายงานยอดขาย',
    })] });
    return;
  }

  if (
    flowState.status === FLOW_STATES.AWAITING_CONFIRMATION ||
    flowState.status === FLOW_STATES.AWAITING_FINAL_CONFIRMATION
  ) {
    await updateFlowState(lineUserId, { status: FLOW_STATES.AWAITING_IMAGES });
  } else if (flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'รายการนี้ยังไม่พร้อมรับรูป กรุณาตรวจยอดขายหรือเริ่มรายงานยอดขายใหม่' }] });
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
      message: 'ระบบไม่สามารถอ่านรหัสผู้ใช้จาก LINE event ได้ หากคุณใช้งานในห้องแชทนี้ โปรดพิมพ์คำสั่ง #ยอดขาย ใหม่อีกครั้ง',
      buttonLabel: 'เริ่มใหม่',
      buttonText: '#ยอดขาย',
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
      message: 'หากคุณเพิ่งเริ่มใช้งาน กรุณาพิมพ์ #ยอดขาย พร้อมรายละเอียดก่อน แล้วระบบจะรอรับรูปตรวจสอบ',
      buttonLabel: 'เริ่มรายงานยอดขาย',
      buttonText: '#ยอดขาย',
      color: '#2563EB',
      altText: 'ไม่พบรายการยอดขาย',
    })] });
    return;
  }

  if (isCancelCommand(text)) {
    setFlowState(lineUserId, null);
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'ยกเลิกรายงานยอดขายแล้ว',
      subtitle: 'ยังไม่มีการบันทึกข้อมูล',
      message: 'ล้างรายการยอดขายที่กำลังทำอยู่เรียบร้อยแล้ว หากต้องการส่งใหม่ให้พิมพ์ #ยอดขาย พร้อมรายละเอียดอีกครั้ง',
      buttonLabel: 'เริ่มใหม่',
      buttonText: '#ยอดขาย',
      color: '#64748B',
      altText: 'ยกเลิกรายงานยอดขายแล้ว',
    })] });
    return;
  }

  if (isEditCommand(text)) {
    return handleEditFlow(event);
  }

  if (isFinishImagesCommand(text)) {
    const imageCount = (flowState.images || []).length;
    if (flowState.status !== FLOW_STATES.AWAITING_IMAGES) {
      await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
        title: 'ยังไม่ได้อยู่ขั้นตอนส่งรูป',
        subtitle: 'กรุณากดส่งรูปก่อน',
        message: 'หากต้องการแนบรูปหลักฐาน ให้พิมพ์ "ส่งรูป" แล้วส่งรูปเข้ามา จากนั้นพิมพ์ "ส่งรูปเสร็จ"',
        buttonLabel: 'ส่งรูป',
        buttonText: 'ส่งรูป',
        color: '#2563EB',
        altText: 'ยังไม่ได้อยู่ขั้นตอนส่งรูป',
      })] });
      return;
    }

    if (imageCount < 1) {
      await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
        title: 'ยังไม่มีรูปหลักฐาน',
        subtitle: 'ส่งรูปก่อนพิมพ์ส่งรูปเสร็จ',
        message: 'กรุณาส่งรูปหลักฐานอย่างน้อย 1 รูป แล้วพิมพ์ "ส่งรูปเสร็จ" เพื่อสรุปยอดขาย',
        buttonLabel: 'ส่งรูป',
        buttonText: 'ส่งรูป',
        color: '#2563EB',
        altText: 'ยังไม่มีรูปหลักฐาน',
      })] });
      return;
    }

    const updatedState = updateFlowState(lineUserId, {
      imageSummaryShown: true,
      status: FLOW_STATES.AWAITING_FINAL_CONFIRMATION,
    });

    await replyOrPush({
      replyToken: event.replyToken,
      messages: [buildSalesSummaryFromState(updatedState, 'final')],
    });
    return;
  }

  if (isUploadCommand(text)) {
    return handleUploadPrompt(event);
  }

  const wantsFinalSave = isFinalSaveCommand(text);

  // Handle final save when user confirms from the sales summary.
  if (flowState.status === FLOW_STATES.AWAITING_FINAL_CONFIRMATION && wantsFinalSave) {
    const calculatedTotal = sumMoney(
      flowState.parsed_data.cash_amount,
      flowState.parsed_data.credit_amount,
      flowState.parsed_data.transfer_amount,
    );
    const enteredTotal = Number(flowState.parsed_data.total_sales || 0);
    if (!moneyEquals(calculatedTotal, enteredTotal)) {
      await replyOrPush({ replyToken: event.replyToken, messages: [ totalMismatchFlex({
        cash: flowState.parsed_data.cash_amount,
        credit: flowState.parsed_data.credit_amount,
        transfer: flowState.parsed_data.transfer_amount,
        calculatedTotal,
        enteredTotal,
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
        auditActorType: flowState.audit_actor_type,
        auditActorId: flowState.audit_actor_id,
        auditActorName: flowState.audit_actor_name,
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
        messages: [
          { type: 'text', text: 'บันทึกยอดขายแล้ว ระบบจะส่งแจ้งเตือนผู้อนุมัติอัตโนมัติ' },
          managerApprovalFlex({
            saleId: sale.id,
            branchCode: flowState.branch_code,
            submitterName: flowState.submitter_name,
            cash: flowState.parsed_data.cash_amount,
            credit: flowState.parsed_data.credit_amount,
            transfer: flowState.parsed_data.transfer_amount,
            total: flowState.parsed_data.total_sales,
            imageCount: messageIds.length,
            attachmentUrls,
          }),
        ]
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

  if (flowState.status === FLOW_STATES.AWAITING_CONFIRMATION) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'รอตรวจยอดขาย',
      subtitle: 'ยังไม่ถึงขั้นตอนส่งรูป',
      message: 'รายการนี้ยังเป็นสถานะเก่า หากต้องการแนบรูปให้พิมพ์ "ส่งรูป" หรือแก้ไขข้อมูลเพื่อเริ่มใหม่',
      buttonLabel: 'ส่งรูป',
      buttonText: 'ส่งรูป',
      color: '#2563EB',
      altText: 'รอตรวจยอดขาย',
    })] });
    return;
  }

  if (flowState.status === FLOW_STATES.AWAITING_IMAGES) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'กำลังรอรูปหลักฐาน',
      subtitle: `ได้รับแล้ว ${(flowState.images || []).length} รูป`,
      message: 'ส่งรูปเพิ่มได้เรื่อย ๆ เมื่อครบแล้วพิมพ์ "ส่งรูปเสร็จ" เพื่อสรุปยอดขาย',
      buttonLabel: 'สรุปยอด',
      buttonText: 'ส่งรูปเสร็จ',
      color: '#2563EB',
      altText: 'กำลังรอรูปหลักฐาน',
    })] });
    return;
  }

  if (flowState.status === FLOW_STATES.AWAITING_FINAL_CONFIRMATION) {
    await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
      title: 'รอยืนยันส่งยอดขาย',
      subtitle: 'ตรวจสรุปยอดและรูปแนบ',
      message: 'หากข้อมูลถูกต้องให้กดหรือพิมพ์ "ยืนยันส่ง" หากต้องการแนบรูปเพิ่มให้พิมพ์ "ส่งรูป"',
      buttonLabel: 'ยืนยันส่ง',
      buttonText: 'ยืนยันส่ง',
      color: '#0D9488',
      altText: 'รอยืนยันส่งยอดขาย',
    })] });
    return;
  }

  await replyOrPush({ replyToken: event.replyToken, messages: [salesNoticeFlex({
    title: 'ยังดำเนินการต่อไม่ได้',
    subtitle: 'สถานะรายการไม่ตรงกับคำสั่ง',
    message: 'กรุณาพิมพ์ "แก้ไขข้อมูล" เพื่อเริ่มใหม่ หรือ "ยกเลิก" เพื่อล้างรายการนี้',
    buttonLabel: 'แก้ไขข้อมูล',
    buttonText: 'แก้ไขข้อมูล',
    color: '#EA580C',
    altText: 'ยังดำเนินการต่อไม่ได้',
  })] });
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
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: 'เริ่มยอดขายใหม่ได้เลยครับ พิมพ์ #ยอดขาย พร้อมยอดขายใหม่ แล้วส่งรูปหลักฐานอีกครั้ง' }],
  });
}
module.exports = { 
  handleTextMessage, 
  handleImageMessage, 
  handleUploadPrompt,
  handleConfirmation,
  handleEditFlow 
};
