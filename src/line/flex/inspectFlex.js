function infoRow(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 4 },
      {
        type: 'text',
        text: String(value || '-'),
        align: 'end',
        weight: 'bold',
        color,
        size: 'sm',
        flex: 6,
        wrap: true,
      },
    ],
  };
}

function baseBubble({ title, subtitle, color, body, footer, altText }) {
  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title, weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: subtitle, color: '#E0F2FE', size: 'xs', wrap: true, margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#F8FAFC',
        contents: body,
      },
      footer,
    },
  };
}

function inspectionSummaryFlex({ branchCode, submitterName, photoCount, workDate, submitTime }) {
  return baseBubble({
    title: 'สรุปตรวจร้าน',
    subtitle: 'ตรวจข้อมูลก่อนส่งให้ผู้จัดการอนุมัติ',
    color: '#0F766E',
    altText: `สรุปตรวจร้าน ${branchCode || ''}`,
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
          infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
          infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
          infoRow('วันที่', workDate || '-'),
          infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
          infoRow('รูปตรวจร้าน', `${photoCount || 0} รูป`, '#1D4ED8'),
        ],
      },
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16A34A',
          action: { type: 'message', label: 'ยืนยันส่ง', text: 'ยืนยันส่ง' },
        },
      ],
    },
  });
}

function inspectionPendingFlex({ inspectionId, branchCode, submitterName, photoCount, workDate, submitTime }) {
  return baseBubble({
    title: `ตรวจร้าน #${inspectionId}`,
    subtitle: 'รอผู้จัดการตรวจและอนุมัติ',
    color: '#0F172A',
    altText: `ตรวจร้าน #${inspectionId} รออนุมัติ`,
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
          infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
          infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
          infoRow('วันที่', workDate || '-'),
          infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
          infoRow('รูปแนบ', `${photoCount || 0} รูป`, '#1D4ED8'),
        ],
      },
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16A34A',
          action: { type: 'postback', label: 'อนุมัติ', data: `inspect_action|${inspectionId}|approve` },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'มีปัญหา', data: `inspect_action|${inspectionId}|problem` },
        },
      ],
    },
  });
}

function inspectionResultFlex({ inspectionId, branchCode, status, reviewedBy, reviewTime, managerNote }) {
  const ok = status === 'pass';
  return baseBubble({
    title: ok ? 'ตรวจร้านอนุมัติแล้ว' : 'ตรวจร้านมีปัญหา',
    subtitle: `รายการ #${inspectionId}`,
    color: ok ? '#16A34A' : '#DC2626',
    altText: ok ? 'ผลตรวจร้าน: อนุมัติ' : 'ผลตรวจร้าน: มีปัญหา',
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
          infoRow('สาขา', branchCode || '-'),
          infoRow('สถานะ', ok ? 'อนุมัติ' : 'มีปัญหา', ok ? '#16A34A' : '#DC2626'),
          infoRow('ผู้ตรวจอนุมัติ', reviewedBy || 'ผู้จัดการ'),
          infoRow('เวลา', reviewTime ? String(reviewTime).slice(0, 5) : '-'),
          infoRow('หมายเหตุ', managerNote || (ok ? 'ผ่านการตรวจ' : 'พบปัญหา')),
        ],
      },
    ],
  });
}

module.exports = {
  inspectionSummaryFlex,
  inspectionPendingFlex,
  inspectionResultFlex,
};
