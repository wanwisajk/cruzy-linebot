const { COLORS, row: infoRow, card, bubble: baseBubble, resultFlex } = require('./uiFlex');

function inspectionSummaryFlex({ branchCode, submitterName, photoCount, workDate, submitTime }) {
  return baseBubble({
    title: 'สรุปตรวจร้าน',
    subtitle: 'ตรวจข้อมูลก่อนส่งให้ผู้จัดการอนุมัติ',
    color: '#0F766E',
    altText: `สรุปตรวจร้าน ${branchCode || ''}`,
    body: [
      card([
          infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
          infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
          infoRow('วันที่', workDate || '-'),
          infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
          infoRow('รูปตรวจร้าน', `${photoCount || 0} รูป`, '#1D4ED8'),
      ]),
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
      card([
          infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
          infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
          infoRow('วันที่', workDate || '-'),
          infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
          infoRow('รูปแนบ', `${photoCount || 0} รูป`, '#1D4ED8'),
      ]),
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
  return resultFlex({
    title: ok ? 'ตรวจร้านอนุมัติแล้ว' : 'ตรวจร้านมีปัญหา',
    subtitle: `รายการ #${inspectionId}`,
    statusLabel: ok ? 'อนุมัติ' : 'มีปัญหา',
    statusColor: ok ? COLORS.success : COLORS.danger,
    altText: ok ? 'ผลตรวจร้าน: อนุมัติ' : 'ผลตรวจร้าน: มีปัญหา',
    rows: [
          infoRow('สาขา', branchCode || '-'),
          infoRow('ผู้ตรวจอนุมัติ', reviewedBy || 'ผู้จัดการ'),
          infoRow('เวลา', reviewTime ? String(reviewTime).slice(0, 5) : '-'),
          infoRow('หมายเหตุ', managerNote || (ok ? 'ผ่านการตรวจ' : 'พบปัญหา')),
    ],
  });
}

module.exports = {
  inspectionSummaryFlex,
  inspectionPendingFlex,
  inspectionResultFlex,
};
