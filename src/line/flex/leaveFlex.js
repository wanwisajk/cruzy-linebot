const { COLORS, row: uiRow, resultFlex } = require('./uiFlex');

function row(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 4 },
      { type: 'text', text: String(value || '-'), color, size: 'sm', weight: 'bold', align: 'end', flex: 6, wrap: true },
    ],
  };
}

function bubble({ title, subtitle, color, body, footer, altText }) {
  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'xl', wrap: true },
          subtitle ? { type: 'text', text: subtitle, color: '#E0F2FE', size: 'xs', margin: 'xs', wrap: true } : null,
        ].filter(Boolean),
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#F8FAFC',
        paddingAll: 'lg',
        contents: body,
      },
      footer,
    },
  };
}

function leaveTypeFlex() {
  const types = ['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาประจำปี'];
  return bubble({
    title: 'เลือกประเภทการลา',
    subtitle: 'กดประเภทการลาที่ต้องการ',
    color: '#1D4ED8',
    altText: 'เลือกประเภทการลา',
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: 'เลือกจากปุ่มด้านล่าง', color: '#64748B', size: 'sm', wrap: true },
        ],
      },
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          borderColor: '#E2E8F0',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          spacing: 'sm',
          contents: types.map((type) => ({
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: { type: 'message', label: type, text: type },
          })),
        },
      ],
    },
  });
}

function leaveDetailPromptFlex({ type }) {
  return bubble({
    title: 'กรอกข้อมูลวันลา',
    subtitle: type || 'คำขอลา',
    color: '#0F766E',
    altText: 'กรอกข้อมูลวันลา',
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        spacing: 'sm',
        contents: [
          row('วันที่เริ่มลา', '13/06/2026', '#1E293B'),
          row('วันที่สิ้นสุด', '14/06/2026', '#1E293B'),
          row('เหตุผล', 'มีธุระส่วนตัว', '#1E293B'),
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8FAFC',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'sm',
        contents: [
          { type: 'text', text: 'กรุณาพิมพ์ข้อมูลตามตัวอย่าง', color: '#64748B', size: 'xs', wrap: true },
        ],
      },
    ],
  });
}

function leaveAttachmentPromptFlex({ type }) {
  return bubble({
    title: 'แนบรูปเพิ่มเติม',
    subtitle: type || 'เอกสารประกอบคำขอลา',
    color: '#7C3AED',
    altText: 'แนบเอกสารประกอบคำขอลา',
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'หากมีเอกสารประกอบ เช่น ใบรับรองแพทย์ หรือเอกสารอื่น สามารถส่งรูปหลายรูปหรือ PDF ได้', color: '#1E293B', size: 'sm', wrap: true },
          { type: 'text', text: 'เมื่อส่งครบแล้วให้พิมพ์ เสร็จ', color: '#0F766E', size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: 'หากไม่มีรูป สามารถพิมพ์ ข้าม', color: '#64748B', size: 'xs', wrap: true },
        ],
      },
    ],
  });
}

function leaveSummaryFlex({ employeeName, type, from, to, reason, attachmentCount }) {
  return bubble({
    title: 'สรุปคำขอลา',
    subtitle: 'สถานะ : รอส่ง',
    color: '#0F766E',
    altText: 'สรุปคำขอลา',
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        spacing: 'sm',
        contents: [
          row('ผู้ขอ', employeeName || '-'),
          row('ประเภท', type || '-'),
          row('วันที่', `${from || '-'} - ${to || '-'}`),
          row('เหตุผล', reason || '-'),
          row('จำนวนรูป', `${attachmentCount || 0} ไฟล์`, '#1D4ED8'),
          row('สถานะ', 'รอส่ง', '#D97706'),
        ],
      },
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          borderColor: '#E2E8F0',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          spacing: 'sm',
          contents: [
            { type: 'button', style: 'primary', color: '#16A34A', height: 'sm', action: { type: 'message', label: 'ยืนยันส่ง', text: 'ยืนยันส่ง' } },
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิก' } },
          ],
        },
      ],
    },
  });
}

function leaveApprovalFlex({ id, employeeName, branchCode, type, from, to, reason, attachmentCount, approveData, rejectData }) {
  return bubble({
    title: 'มีคำขอลาใหม่',
    subtitle: `#${id} · สถานะ : รออนุมัติ`,
    color: '#0F172A',
    altText: `คำขอลาใหม่ #${id}`,
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        spacing: 'sm',
        contents: [
          row('ผู้ขอ', employeeName || '-'),
          row('สาขา', branchCode || '-'),
          row('ประเภท', type || '-'),
          row('วันที่', `${from || '-'} - ${to || '-'}`),
          row('เอกสารแนบ', `${attachmentCount || 0} ไฟล์`, '#1D4ED8'),
          row('สถานะ', 'รออนุมัติ', '#D97706'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: String(reason || '-'), color: '#1E293B', size: 'sm', wrap: true, margin: 'sm' },
        ],
      },
    ],
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'primary', color: '#16A34A', height: 'sm', flex: 1, action: { type: 'postback', label: 'อนุมัติ', data: approveData } },
        { type: 'button', style: 'secondary', height: 'sm', flex: 1, action: { type: 'postback', label: 'ไม่อนุมัติ', data: rejectData } },
      ],
    },
  });
}

function leaveResultFlex({ id, employeeName, type, from, to, status, approvedBy, attachmentCount = 0 }) {
  const approved = status === 'approved';
  const rows = [
    uiRow('ผู้ขอ', employeeName || '-'),
    uiRow('ประเภท', type || '-'),
    uiRow('วันที่', `${from || '-'} - ${to || '-'}`),
    uiRow('เอกสารแนบ', `${Number(attachmentCount || 0)} ไฟล์`, COLORS.info),
    uiRow('ผู้อนุมัติ', approvedBy || '-'),
  ];

  return resultFlex({
    title: approved ? 'อนุมัติวันลาเรียบร้อย' : 'ไม่อนุมัติวันลา',
    subtitle: `คำขอลา #${id}`,
    statusLabel: approved ? 'อนุมัติ' : 'ไม่อนุมัติ',
    statusColor: approved ? COLORS.success : COLORS.danger,
    altText: approved ? 'อนุมัติวันลาเรียบร้อย' : 'ไม่อนุมัติวันลา',
    rows,
  });
}

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

function noticeFlex({ title, subtitle, message, buttonLabel, buttonText, color = '#0F172A', altText, quickReply }) {
  const messageBubble = bubble({
    title: title || 'แจ้งเตือน',
    subtitle: subtitle || '',
    color,
    body: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: message || '-', color: '#1E293B', size: 'sm', wrap: true },
        ],
      },
    ],
    footer: buttonLabel ? {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'primary', color: '#16A34A', height: 'sm', action: { type: 'message', label: buttonLabel, text: buttonText || buttonLabel } },
      ],
    } : undefined,
    altText: altText || title || 'แจ้งเตือน',
  });

  if (quickReply) messageBubble.quickReply = quickReply;

  return messageBubble;
}

module.exports = legacyLeaveFlex;
module.exports.leaveTypeFlex = leaveTypeFlex;
module.exports.leaveDetailPromptFlex = leaveDetailPromptFlex;
module.exports.leaveAttachmentPromptFlex = leaveAttachmentPromptFlex;
module.exports.leaveSummaryFlex = leaveSummaryFlex;
module.exports.leaveApprovalFlex = leaveApprovalFlex;
module.exports.leaveResultFlex = leaveResultFlex;
module.exports.noticeFlex = noticeFlex;
