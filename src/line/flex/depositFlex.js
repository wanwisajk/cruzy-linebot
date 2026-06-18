const { COLORS, row: uiRow, card, bubble, resultFlex, primaryButton, secondaryButton } = require('./uiFlex');

// ปรับปรุง Row แสดงจำนวนเงินฝากให้คลีน มีมิติ และใส่ไอคอนอัตโนมัติ
function depositAmountRow(label, amount, color = COLORS.ink) {
  let emoji = '💰 ';
  if (label.includes('ฝาก') || label.includes('รวม')) emoji = '💵 ';

  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: `${emoji}${label}`, color: COLORS.muted, size: 'xs', flex: 4, wrap: true },
      {
        type: 'text',
        text: `${Number(amount || 0).toLocaleString()} บาท`,
        align: 'end',
        weight: 'bold',
        color,
        size: 'sm',
        flex: 6,
        wrap: true,
      }
    ]
  };
}

// ปรับปรุง Row แสดงข้อมูลทั่วไปให้ตัวหนังสือกระชับสายตา
function depositInfoRow(label, value, color = COLORS.ink) {
  let emoji = '📌 ';
  if (label.includes('ผู้ส่ง')) emoji = '👤 ';
  if (label.includes('สาขา')) emoji = '📍 ';
  if (label.includes('รูป') || label.includes('สลิป')) emoji = '📸 ';
  if (label.includes('บัญชี') || label.includes('ธนาคาร')) emoji = '🏦 ';
  if (label.includes('วันที่')) emoji = '📅 ';
  if (label.includes('เวลา')) emoji = '🕒 ';

  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: `${emoji}${label}`, color: COLORS.muted, size: 'xs', flex: 4 },
      {
        type: 'text',
        text: String(value || '-'),
        align: 'end',
        weight: 'bold',
        color,
        size: 'sm',
        flex: 6,
        wrap: true
      }
    ]
  };
}

function depositConfirmFlex({ tempId, amount, bank, slipCount, branchCode, submitterName, depositDate }) {
  return bubble({
    title: '📊 สรุปยอดฝาก',
    subtitle: branchCode ? `สาขา ${String(branchCode)}` : `รายการแบบร่าง #${tempId}`,
    color: COLORS.teal,
    altText: `สรุปยอดฝาก สาขา ${branchCode || tempId}`,
    body: [
      card([
        submitterName ? depositInfoRow('ผู้ส่งยอดฝาก', submitterName) : null,
        depositDate ? depositInfoRow('วันที่ฝาก', depositDate) : null,
        depositInfoRow('บัญชีปลายทาง', bank || 'ไม่ระบุ'),
        typeof slipCount === 'number' ? depositInfoRow('รูปหลักฐาน', `${slipCount} รูป`, COLORS.info) : null,
        depositAmountRow('ยอดเงินฝาก', amount)
      ].filter(Boolean)),
      // ใช้โครงสร้างกล่อง Hero Stat ไร้ขอบสีเขียวมิ้นต์อ่อนๆ ละมุนตา
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F0FDF4', 
        cornerRadius: 'xl',
        paddingAll: 'lg',
        margin: 'md',
        contents: [
          { type: 'text', text: 'ยอดรวมที่ต้องการส่งฝาก', color: COLORS.success, size: 'xs', weight: 'bold' },
          {
            type: 'text',
            text: `${Number(amount || 0).toLocaleString()} บาท`,
            align: 'end',
            weight: 'bold',
            size: 'xxl',
            color: COLORS.teal,
            margin: 'xs'
          }
        ]
      },
      {
        type: 'text',
        text: 'ตรวจยอดและรูปสลิปให้ถูกต้อง แล้วกดยืนยันส่งเพื่อส่งให้ผู้จัดการอนุมัติ',
        size: 'xs',
        color: COLORS.muted,
        wrap: true,
        margin: 'md'
      }
    ],
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        primaryButton('ยืนยันส่ง', { type: 'postback', data: `deposit_draft|${tempId}|send` }, COLORS.success),
        secondaryButton('✏️ แก้ไขข้อมูล', { type: 'postback', data: `deposit_draft|${tempId}|edit` })
      ]
    }
  });
}

function managerApprovalFlex({
  depositId,
  branchCode,
  depositDate,
  amount,
  bankShort,
  bankName,
  accountName,
  accountNo,
  slipCount,
  slipUrls,
  submittedAt,
  depositedBy,
}) {
  const accountLabel = accountName || bankShort || bankName || 'ไม่ระบุ';
  const accountValue = accountNo ? `${accountLabel} / ${accountNo}` : accountLabel;

  return bubble({
    title: `⏳ ยอดฝากรออนุมัติ`,
    subtitle: `รายการ #${depositId}`,
    color: COLORS.ink,
    altText: `ยอดฝาก #${depositId} รออนุมัติ`,
    body: [
      { 
        type: 'text', 
        text: 'ตรวจสอบสรุปยอดฝากแล้วกดเลือกดำเนินการ:', 
        size: 'sm', 
        color: COLORS.ink, 
        wrap: true 
      }
    ],
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
 primaryButton('✅ อนุมัติ', { type: 'postback', data: `deposit_action|${depositId}|approve` }, COLORS.success),
            secondaryButton('❌ ไม่อนุมัติ', { type: 'postback', data: `deposit_action|${depositId}|reject` })
      ]
    }
  });
}
           
function depositSuccessFlex({ depositId, branchCode, bank, amount, slipCount }) {
  return bubble({
    title: '🎉 บันทึกยอดฝากสำเร็จ',
    subtitle: `รหัสเอกสาร #${depositId || '-'}`,
    color: COLORS.teal,
    altText: 'บันทึกยอดฝากสำเร็จ',
    body: [
      card([
        depositInfoRow('สาขา', String(branchCode || 'ไม่ระบุสาขา')),
        depositInfoRow('บัญชีปลายทาง', bank || '-'),
        depositAmountRow('ยอดเงินฝาก', amount),
      ]),
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F0FDF4',
        cornerRadius: 'xl',
        paddingAll: 'lg',
        margin: 'md',
        contents: [
          { type: 'text', text: 'ยอดรวมทั้งหมด', color: COLORS.success, size: 'xs', weight: 'bold' },
          { type: 'text', text: `${Number(amount || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', size: 'xxl', color: COLORS.teal, margin: 'xs' },
        ]
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'xs',
        contents: [
          { type: 'text', text: `📸 แนบรูปสลิปหลักฐานแล้ว ${Number(slipCount || 0)} รูป`, size: 'xs', color: COLORS.muted, wrap: true },
          { type: 'text', text: '✨ ระบบบันทึกข้อมูลเรียบร้อยแล้ว รอการตรวจสอบอนุมัติจากผู้จัดการ', size: 'xs', color: COLORS.muted, wrap: true }
        ]
      }
    ]
  });
}

function depositApprovedResultFlex({ id, branchCode, depositDate, depositedAmount, verifiedBy, verifiedAt, slipCount = 0 }) {
  return resultFlex({
    title: '✅ ยอดฝากได้รับการอนุมัติ',
    subtitle: `สาขา ${branchCode}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: 'อนุมัติยอดฝากเรียบร้อย',
    rows: [
      uiRow('วันที่', depositDate || '-'),
      uiRow('ยอดรวมฝาก', `${Number(depositedAmount || 0).toLocaleString()} บาท`, COLORS.success),
      uiRow('รูปแนบ', `${Number(slipCount || 0)} รูป`, COLORS.info),
      uiRow('อนุมัติโดย', verifiedBy || 'ผู้จัดการ'),
      uiRow('เวลาอนุมัติ', verifiedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

function depositNoticeFlex({ title, subtitle, message, buttonLabel, buttonText, color = COLORS.ink, altText, quickReply }) {
  const payload = bubble({
    title: title || '📢 แจ้งเตือนยอดฝาก',
    subtitle,
    color,
    altText: altText || title || 'Deposit notification',
    body: [
      card([
        { type: 'text', text: message || '-', color: COLORS.ink, size: 'sm', wrap: true },
      ])
    ],
    footer: buttonLabel ? {
      type: 'box',
      layout: 'vertical',
      contents: [
        primaryButton(buttonLabel, { type: 'message', text: buttonText || buttonLabel }, COLORS.success)
      ]
    } : undefined
  });

  if (quickReply) {
    payload.quickReply = quickReply;
  }

  return payload;
}

function depositRejectedFlex({ depositId, branchCode, rejectedBy, rejectedAt }) {
  return resultFlex({
    title: '❌ ตีกลับรายการฝากเงินแล้ว',
    subtitle: `รายการ #${depositId}`,
    statusLabel: 'ตีกลับ',
    statusColor: COLORS.danger,
    altText: 'ตีกลับรายการฝากเงินแล้ว',
    rows: [
      uiRow('Deposit ID', depositId),
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('ตีกลับโดย', rejectedBy || 'ผู้จัดการ'),
      uiRow('เวลาที่ตีกลับ', rejectedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

module.exports = {
  depositConfirmFlex,
  managerApprovalFlex,
  depositSuccessFlex,
  depositApprovedResultFlex,
  depositNoticeFlex,
  depositRejectedFlex,
};
