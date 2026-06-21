const { COLORS, row: uiRow, card, bubble, resultFlex, primaryButton, secondaryButton } = require('./uiFlex');

// ปรับปรุง Row แสดงจำนวนเงินให้คลีน มีมิติ และใส่ไอคอนอัตโนมัติ
function salesAmountRow(label, amount, color = COLORS.ink) {
  let emoji = '💰 ';
  if (label.includes('เงินสด')) emoji = '💵 ';
  if (label.includes('เครดิต')) emoji = '💳 ';
  if (label.includes('โอน')) emoji = '🏦 ';

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
function salesInfoRow(label, value, color = COLORS.ink) {
  let emoji = '📌 ';
  if (label.includes('ผู้ส่ง')) emoji = '👤 ';
  if (label.includes('สาขา')) emoji = '📍 ';
  if (label.includes('รูป')) emoji = '📸 ';
  if (label.includes('รหัส')) emoji = '📄 ';

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

function salesSummaryFlex({ branchCode, submitterName, sellDate, cash, credit, transfer, total, drawerTotal, imageCount, mode = 'final' }) {
  const isFinal = mode === 'final';
  const footerButtons = isFinal
    ? [
        primaryButton('ยืนยันส่ง', { type: 'message', text: 'ยืนยันส่ง' }, COLORS.success),
        secondaryButton('ส่งรูปเพิ่ม', { type: 'message', text: 'ส่งรูป' }),
        secondaryButton('แก้ไข', { type: 'message', text: 'แก้ไขข้อมูล' }),
        secondaryButton('ยกเลิก', { type: 'message', text: 'ยกเลิก' }),
      ]
    : [
        primaryButton('ส่งรูป', { type: 'message', text: 'ส่งรูป' }, COLORS.success),
        secondaryButton('แก้ไข', { type: 'message', text: 'แก้ไขข้อมูล' }),
        secondaryButton('ยกเลิก', { type: 'message', text: 'ยกเลิก' }),
      ];

  return bubble({
    title: isFinal ? '📊 สรุปยอดขายก่อนส่ง' : '🧾 ตรวจยอดขาย',
    subtitle: `สาขา ${String(branchCode || '-')}`,
    color: COLORS.teal,
    altText: `สรุปยอดขาย สาขา ${branchCode}`,
    body: [
      card([
        salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ'),
        sellDate ? salesInfoRow('วันที่ขาย', sellDate) : null,
        typeof imageCount === 'number' ? salesInfoRow('รูปหลักฐาน', `${imageCount} รูป`, COLORS.info) : null,
        salesAmountRow('เงินสด', cash),
        salesAmountRow('เครดิต', credit),
        salesAmountRow('โอนเงิน', transfer),
        Number(drawerTotal || 0) > 0 ? salesAmountRow('เงินในลิ้นชัก', drawerTotal, COLORS.warning) : null,
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
          { type: 'text', text: 'ยอดรวมทั้งหมด', color: COLORS.success, size: 'xs', weight: 'bold' },
          {
            type: 'text',
            text: `${Number(total || 0).toLocaleString()} บาท`,
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
        text: isFinal
          ? 'ตรวจยอดและรูปแนบให้ถูกต้อง แล้วกดยืนยันส่งเพื่อส่งให้ผู้จัดการอนุมัติ'
          : 'ตรวจยอดให้ถูกต้องก่อนส่งรูป หากข้อมูลผิดให้กดแก้ไขข้อมูล แล้วพิมพ์ยอดขายใหม่อีกครั้ง',
        size: 'xs',
        color: COLORS.muted,
        wrap: true,
        margin: 'md'
      }
    ],
    footer: {
      type: 'box',
      layout: footerButtons.length > 2 ? 'vertical' : 'horizontal',
      spacing: 'sm',
      contents: footerButtons
    }
  });
}

function totalMismatchFlex({ cash, credit, transfer, calculatedTotal, enteredTotal }) {
  const diff = calculatedTotal - enteredTotal;
  return bubble({
    title: '⚠️ ยอดรวมไม่ตรงกัน',
    subtitle: 'ระบบตรวจพบความต่างของตัวเลข',
    color: COLORS.danger,
    altText: 'ยอดรวมไม่ตรงกัน',
    body: [
      card([
        salesAmountRow('เงินสด', cash),
        salesAmountRow('เครดิต', credit),
        salesAmountRow('โอนเงิน', transfer)
      ]),
      { type: 'separator', margin: 'md' },
      {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [ { type: 'text', text: '📊 ผลรวมที่คำนวณได้', color: COLORS.muted, size: 'xs' }, { type: 'text', text: `${Number(calculatedTotal||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: COLORS.success, size: 'sm' } ]
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [ { type: 'text', text: '✏️ ยอดที่กรอก', color: COLORS.muted, size: 'xs' }, { type: 'text', text: `${Number(enteredTotal||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: COLORS.danger, size: 'sm' } ]
          }
        ]
      },
      // กล่องส้มครีมแจ้งเตือนส่วนต่าง ชัดเจน ไม่ดูดุดันจนเกินไป
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFBEB',
        cornerRadius: 'xl',
        paddingAll: 'lg',
        margin: 'md',
        contents: [
          { type: 'text', text: 'ส่วนต่างที่พบ', color: '#B45309', size: 'xs', weight: 'bold' },
          { type: 'text', text: `${Number(diff||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', size: 'xxl', color: COLORS.danger, margin: 'xs' },
        ]
      },
      { type: 'text', text: '❌ โปรดตรวจสอบและแก้ไขข้อมูลก่อนส่งอีกครั้ง', size: 'xs', color: COLORS.danger, wrap: true, margin: 'md' }
    ]
  });
}

function managerApprovalFlex({ saleId }) {
  return bubble({
    title: `⏳ ยอดขายรออนุมัติ`,
    subtitle: `รายการ #${saleId}`,
    color: COLORS.ink,
    altText: `ยอดขาย #${saleId} รออนุมัติ`,
    body: [
      { 
        type: 'text', 
        text: 'ตรวจสอบสรุปยอดขาย แล้วกดเลือกดำเนินการ:', 
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
        primaryButton('✅ อนุมัติ', { type: 'postback', data: `sales_action|${saleId}|approve` }, COLORS.success),
        secondaryButton('❌ ไม่อนุมัติ', { type: 'postback', data: `sales_action|${saleId}|reject` })
      ]
    }
  });
}

function successFlex({ branchCode, cash, credit, transfer, total, saleId, imageCount }) {
  return bubble({
    title: '🎉 บันทึกยอดขายสำเร็จ',
    subtitle: `รหัสเอกสาร #${saleId || '-'}`,
    color: COLORS.teal,
    altText: 'บันทึกยอดขายสำเร็จ',
    body: [
      card([
        salesInfoRow('สาขา', String(branchCode || 'ไม่ระบุสาขา')),
        salesAmountRow('เงินสด', cash),
        salesAmountRow('เครดิต', credit),
        salesAmountRow('โอนเงิน', transfer),
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
          { type: 'text', text: `${Number(total || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', size: 'xxl', color: COLORS.teal, margin: 'xs' },
        ]
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'xs',
        contents: [
          { type: 'text', text: `📸 แนบรูปหลักฐานแล้ว ${Number(imageCount || 0)} รูป`, size: 'xs', color: COLORS.muted, wrap: true },
          { type: 'text', text: '✨ ระบบบันทึกข้อมูลเรียบร้อยแล้ว รอการตรวจสอบอนุมัติจากผู้จัดการ', size: 'xs', color: COLORS.muted, wrap: true }
        ]
      }
    ]
  });
}

function approvedFlex({ saleId, branchCode, total, approvedBy, approvedAt }) {
  return resultFlex({
    title: '✅ อนุมัติยอดขายแล้ว',
    subtitle: `รายการ #${saleId}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: 'อนุมัติยอดขายแล้ว',
    rows: [
      uiRow('Sale ID', saleId),
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('ยอดรวม', `${Number(total || 0).toLocaleString()} บาท`, COLORS.success),
      uiRow('อนุมัติโดย', approvedBy || 'ผู้จัดการ'),
      uiRow('เวลาอนุมัติ', approvedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

function approvedSalesResultFlex({ saleId, branchCode, saleDate, total, approvedBy, approvedAt, attachmentCount = 0 }) {
  return resultFlex({
    title: '✅ ยอดขายได้รับการอนุมัติ',
    subtitle: `สาขา ${branchCode}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: 'อนุมัติยอดขายเรียบร้อย',
    rows: [
      uiRow('วันที่', saleDate || '-'),
      uiRow('ยอดรวม', `${Number(total || 0).toLocaleString()} บาท`, COLORS.success),
      uiRow('รูปแนบ', `${Number(attachmentCount || 0)} รูป`, COLORS.info),
      uiRow('อนุมัติโดย', approvedBy || 'ผู้จัดการ'),
      uiRow('เวลาอนุมัติ', approvedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

function salesNoticeFlex({ title, subtitle, message, buttonLabel, buttonText, color = COLORS.ink, altText, quickReply }) {
  const payload = bubble({
    title: title || '📢 แจ้งเตือนยอดขาย',
    subtitle,
    color,
    altText: altText || title || 'Sales notification',
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

function rejectedFlex({ saleId, branchCode, rejectedBy, rejectedAt }) {
  return resultFlex({
    title: '❌ ตีกลับยอดขายแล้ว',
    subtitle: `รายการ #${saleId}`,
    statusLabel: 'ตีกลับ',
    statusColor: COLORS.danger,
    altText: 'ตีกลับยอดขายแล้ว',
    rows: [
      uiRow('Sale ID', saleId),
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('ตีกลับโดย', rejectedBy || 'ผู้จัดการ'),
      uiRow('เวลาที่ตีกลับ', rejectedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

module.exports = {
  salesSummaryFlex,
  successFlex,
  totalMismatchFlex,
  managerApprovalFlex,
  approvedFlex,
  approvedSalesResultFlex,
  salesNoticeFlex,
  rejectedFlex,
};
