const { COLORS, row: uiRow, card, bubble, resultFlex, primaryButton, secondaryButton } = require('./uiFlex');

const THEME_COLORS = {
  PRIMARY: '#2563EB',  
  SECONDARY: '#0F766E', 
  ACCENT: '#0284C7',    
  INK: COLORS.ink       
};

// Helper: สำหรับจัดแสดงข้อมูลทั่วไป (ใช้ในหน้าสรุปและหน้าอนุมัติ)
function leaveInfoRow(label, value, color = THEME_COLORS.INK) {
  let emoji = '📌 ';
  if (label.includes('ผู้ขอ')) emoji = '👤 ';
  if (label.includes('สาขา')) emoji = '📍 ';
  if (label.includes('ประเภท')) emoji = '📋 ';
  if (label.includes('วันที่') || label.includes('เวลา')) emoji = '📅 ';
  if (label.includes('เหตุผล')) emoji = '💬 ';
  if (label.includes('เอกสาร') || label.includes('รูป')) emoji = '📄 ';
  if (label.includes('ผู้อนุมัติ')) emoji = '🛡️ ';

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

// 1. หน้าเลือกประเภทการลา (น้ำเงินพรีเมียม)
function leaveTypeFlex() {
  const types = ['ลาป่วย', 'ลางาน', 'ลากิจ', 'ลาประจำปี'];
  return bubble({
    title: '📋 เลือกประเภทการลา',
    subtitle: 'กรุณาเลือกประเภทการลาที่ต้องการ',
    color: THEME_COLORS.PRIMARY, 
    altText: 'เลือกประเภทการลา',
    body: [
      card([
        { type: 'text', text: 'กดเลือกประเภทการลาจากปุ่มด้านล่างนี้ เพื่อเริ่มกรอกข้อมูล', color: COLORS.muted, size: 'xs', wrap: true }
      ])
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: types.map((type) => {
        const btnColor = THEME_COLORS.PRIMARY;
        return primaryButton(type, { type: 'message', label: type, text: type }, btnColor);
      })
    }
  });
}

// 2. หน้าแนะนำให้กรอกข้อมูล (Plain Text ส่งธรรมดาเพื่อให้ Copy ง่ายตามบรีฟเดิม)
function leaveDetailPromptText({ type }) {
  const leaveTypeLabel = type ? ` [${type}]` : '';
  
  return `📝 กรอกข้อมูลวันลา${leaveTypeLabel}\n` +
         `วันที่เริ่มลา: \n` +
         `วันที่สิ้นสุด: \n` +
         `เหตุผล: ` 
      ;
}

// 3. หน้าแจ้งเตือนให้แนบรูปภาพ/เอกสารประกอบ (ปรับจากสีม่วงเดิม เป็นสีฟ้าเข้ม ACCENT ให้เข้าชุด)
function leaveAttachmentPromptFlex({ type }) {
  return bubble({
    title: '📎 แนบเอกสารเพิ่มเติม',
    subtitle: type || 'เอกสารประกอบคำขอลา',
    color: THEME_COLORS.ACCENT, 
    altText: 'แนบเอกสารประกอบคำขอลา',
    body: [
      card([
        { type: 'text', text: 'หากมีเอกสารประกอบ เช่น ใบรับรองแพทย์ หรือใบนัด สามารถส่งไฟล์รูปเข้ามาในแชทได้ทันที (ส่งได้หลายรูป)', color: THEME_COLORS.INK, size: 'sm', wrap: true },
      ]),
      {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'xs',
        contents: [
          { type: 'text', text: '✅ เมื่อส่งรูปครบแล้ว ให้พิมพ์คำว่า "เสร็จ"', color: COLORS.success, size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: '⏭️ หากไม่มีเอกสารแนบ ให้พิมพ์คำว่า "ข้าม"', color: COLORS.muted, size: 'xs', wrap: true },
        ]
      }
    ],
  });
}

// 4. หน้าสรุปคำขอลา (ปรับโทนเขียวมิ้นต์/เทล SECONDARY ดูสะอาดตา มีความภูมิฐานก่อนส่งงาน)
function leaveSummaryFlex({ employeeName, type, from, to, reason, attachmentCount }) {
  return bubble({
    title: '📊 สรุปคำขอลา',
    subtitle: 'ตรวจสอบความถูกต้องก่อนส่งใบลา',
    color: THEME_COLORS.SECONDARY,
    altText: 'สรุปคำขอลา',
    body: [
      card([
        leaveInfoRow('ผู้ขอลา', employeeName),
        leaveInfoRow('ประเภทการลา', type, THEME_COLORS.PRIMARY),
        leaveInfoRow('ช่วงเวลาลา', `${from || '-'} ถึง ${to || '-'}`),
        leaveInfoRow('เหตุผลการลา', reason),
        Number(attachmentCount) > 0 ? leaveInfoRow('เอกสารแนบ', `${attachmentCount} ไฟล์`, THEME_COLORS.ACCENT) : null,
      ].filter(Boolean)),
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F0FDF4', // เปลี่ยนเป็นกล่องเขียวอ่อนพาสเทล ให้ความรู้สึกสบายใจ มั่นใจก่อนส่งลอจิก
        cornerRadius: 'xl',
        paddingAll: 'lg',
        margin: 'md',
        contents: [
          { type: 'text', text: 'สถานะรายการ', color: '#16A34A', size: 'xs', weight: 'bold' },
          { type: 'text', text: '⏳ รอการกดส่งใบลา', align: 'end', weight: 'bold', size: 'lg', color: '#15803D', margin: 'xs' }
        ]
      }
    ],
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        primaryButton('ส่งใบลา', { type: 'message', text: 'ยืนยันส่ง' }, THEME_COLORS.PRIMARY),
        secondaryButton('ยกเลิก', { type: 'message', text: 'ยกเลิก' })
      ]
    }
  });
}

// 5. หน้าสำหรับผู้จัดการพิจารณาอนุมัติ (ใช้สีหมึกเข้มระดับพรีเมียมเป็นหัวการ์ด ดูเป็นทางการ)
function leaveApprovalFlex({ id, employeeName, branchCode, type, from, to, reason, attachmentCount, approveData, rejectData }) {
  return bubble({
    title: '🔔 คำขอลาใหม่',
    subtitle: `รหัสคำขอ #${id}`,
    color: THEME_COLORS.INK, 
    altText: `คำขอลาใหม่ #${id}`,
    body: [
      card([
        leaveInfoRow('ผู้ขอลา', employeeName),
        leaveInfoRow('สาขา', branchCode),
        leaveInfoRow('ประเภทการลา', type, THEME_COLORS.PRIMARY),
        leaveInfoRow('ช่วงเวลาลา', `${from || '-'} ถึง ${to || '-'}`),
        Number(attachmentCount) > 0 ? leaveInfoRow('เอกสารแนบ', `${attachmentCount} ไฟล์`, THEME_COLORS.ACCENT) : null,
      ].filter(Boolean)),
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8FAFC', // คลีน ๆ สไตล์สเลทเทา-ฟ้าอ่อน
        paddingAll: 'md',
        cornerRadius: 'md',
        margin: 'md',
        contents: [
          { type: 'text', text: '💬 เหตุผลการลา:', color: COLORS.muted, size: 'xs', weight: 'bold' },
          { type: 'text', text: String(reason || '-'), color: THEME_COLORS.INK, size: 'sm', wrap: true, margin: 'xs' }
        ]
      }
    ],
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        primaryButton('✅ อนุมัติ', { type: 'postback', data: approveData }, COLORS.success),
        secondaryButton('❌ ไม่อนุมัติ', { type: 'postback', data: rejectData })
      ]
    }
  });
}

function leaveStatusFlex({ id, employeeName, branchCode, type, from, to, reason, status, attachmentCount, approverCount = 0 }) {
  const pending = status === 'pending';

  return bubble({
    title: '🔎 เช็คสถานะคำขอลา',
    subtitle: `คำขอลา #${id}`,
    color: pending ? THEME_COLORS.PRIMARY : THEME_COLORS.SECONDARY,
    altText: `เช็คสถานะคำขอลา #${id}`,
    body: [
      card([
        leaveInfoRow('ผู้ขอลา', employeeName),
        leaveInfoRow('สาขา', branchCode || '-'),
        leaveInfoRow('ประเภทการลา', type, THEME_COLORS.PRIMARY),
        leaveInfoRow('ช่วงเวลาลา', `${from || '-'} ถึง ${to || '-'}`),
        Number(attachmentCount) > 0 ? leaveInfoRow('เอกสารแนบ', `${attachmentCount} ไฟล์`, THEME_COLORS.ACCENT) : null,
        leaveInfoRow('ผู้อนุมัติที่แจ้งได้', `${Number(approverCount || 0)} คน`, approverCount ? COLORS.success : COLORS.warning),
      ].filter(Boolean)),
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: pending ? '#EFF6FF' : '#F0FDF4',
        paddingAll: 'lg',
        cornerRadius: 'xl',
        margin: 'md',
        contents: [
          { type: 'text', text: 'สถานะล่าสุด', color: pending ? THEME_COLORS.PRIMARY : COLORS.success, size: 'xs', weight: 'bold' },
          { type: 'text', text: pending ? '⏳ รออนุมัติ' : String(status || '-'), align: 'end', weight: 'bold', size: 'lg', color: pending ? THEME_COLORS.PRIMARY : COLORS.success, margin: 'xs' },
        ]
      },
      reason ? {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8FAFC',
        paddingAll: 'md',
        cornerRadius: 'md',
        margin: 'md',
        contents: [
          { type: 'text', text: '💬 เหตุผลการลา:', color: COLORS.muted, size: 'xs', weight: 'bold' },
          { type: 'text', text: String(reason), color: THEME_COLORS.INK, size: 'sm', wrap: true, margin: 'xs' }
        ]
      } : null,
    ].filter(Boolean),
    footer: pending ? {
      type: 'box',
      layout: 'vertical',
      contents: [
        primaryButton('ติดตามสถานะ', { type: 'postback', data: `leave_follow|${id}`, displayText: '#ติดตามสถานะ' }, THEME_COLORS.PRIMARY),
      ],
    } : undefined,
  });
}

// 6. หน้าแสดงผลลัพธ์การอนุมัติ/ไม่อนุมัติ (ใช้สีจาก COLORS กลางของระบบเพื่อความสม่ำเสมอของ UX)
function leaveResultFlex({ id, employeeName, type, from, to, status, approvedBy, attachmentCount = 0 }) {
  const approved = status === 'approved';
  const rows = [
    uiRow('ผู้ขอลา', employeeName || '-'),
    uiRow('ประเภทการลา', type || '-'),
    uiRow('ช่วงเวลาลา', `${from || '-'} - ${to || '-'}`),
    Number(attachmentCount) > 0 ? uiRow('เอกสารแนบ', `${Number(attachmentCount)} ไฟล์`, THEME_COLORS.ACCENT) : null,
    uiRow('ผู้จัดการ', approvedBy || '-'),
  ].filter(Boolean);

  return resultFlex({
    title: approved ? '✅ อนุมัติวันลาเรียบร้อย' : '❌ ไม่อนุมัติวันลา',
    subtitle: `คำขอลา #${id}`,
    statusLabel: approved ? 'อนุมัติ' : 'ไม่อนุมัติ',
    statusColor: approved ? COLORS.success : COLORS.danger,
    altText: approved ? 'อนุมัติวันลาเรียบร้อย' : 'ไม่อนุมัติวันลา',
    rows,
  });
}

// ฟังก์ชันหลักสำหรับรองรับโครงสร้างแบบเก่า (Legacy)
function legacyLeaveFlex(args) {
  if (args.status === 'approved' || args.status === 'rejected') {
    return leaveResultFlex({
      id: args.id,
      employeeName: args.employeeName,
      type: args.type,
      from: args.from,
      to: args.to,
      status: args.status,
      approvedBy: args.approvedBy,
      attachmentCount: args.attachmentCount,
    });
  }

  return leaveApprovalFlex({
    id: args.id,
    employeeName: args.employeeName,
    branchCode: args.branchCode,
    type: args.type,
    from: args.from,
    to: args.to,
    reason: args.reason,
    attachmentCount: args.attachmentCount || 0,
    approveData: args.approveData,
    rejectData: args.rejectData,
  });
}

// 7. หน้าต่างแจ้งเตือนทั่วไป
function noticeFlex({ title, subtitle, message, buttonLabel, buttonText, color = THEME_COLORS.INK, altText, quickReply }) {
  const messageBubble = bubble({
    title: title || '📢 แจ้งเตือน',
    subtitle: subtitle || '',
    color,
    body: [
      card([
        { type: 'text', text: message || '-', color: THEME_COLORS.INK, size: 'sm', wrap: true },
      ]),
    ],
    footer: buttonLabel ? {
      type: 'box',
      layout: 'vertical',
      contents: [
        primaryButton(buttonLabel, { type: 'message', text: buttonText || buttonLabel }, THEME_COLORS.PRIMARY),
      ],
    } : undefined,
    altText: altText || title || 'แจ้งเตือน',
  });

  if (quickReply) messageBubble.quickReply = quickReply;

  return messageBubble;
}

module.exports = legacyLeaveFlex;
module.exports.leaveTypeFlex = leaveTypeFlex;
module.exports.leaveDetailPromptText = leaveDetailPromptText;
module.exports.leaveAttachmentPromptFlex = leaveAttachmentPromptFlex;
module.exports.leaveSummaryFlex = leaveSummaryFlex;
module.exports.leaveApprovalFlex = leaveApprovalFlex;
module.exports.leaveStatusFlex = leaveStatusFlex;
module.exports.leaveResultFlex = leaveResultFlex;
module.exports.noticeFlex = noticeFlex;
