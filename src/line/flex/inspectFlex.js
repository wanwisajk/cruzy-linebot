const { COLORS, row: infoRow, card, bubble: baseBubble, resultFlex, primaryButton } = require('./uiFlex');

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
      ], { backgroundColor: '#FFFFFF' }),
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

function inspectionLiffEntryFlex({ branchCode, submitterName, workDate, uri }) {
  return baseBubble({
    title: 'ตรวจร้าน',
    subtitle: 'กดดำเนินการต่อเพื่อเปิดหน้าตรวจร้าน',
    color: '#0F766E',
    altText: `เปิดหน้าตรวจร้าน ${branchCode || ''}`,
    body: [
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
      ], { backgroundColor: '#FFFFFF' }),
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
          action: { type: 'uri', label: 'ดำเนินการต่อ', uri },
        },
      ],
    },
  });
}

function normalizeAttachmentItems({ attachments, attachmentUrls }) {
  if (Array.isArray(attachments) && attachments.length > 0) {
    let inspectionIndex = 0;
    return attachments
      .map((attachment, index) => {
        const uri = attachment && (attachment.file_url || attachment.url || attachment.uri);
        if (!uri) return null;

        const fileName = String((attachment && attachment.file_name) || '');
        const storagePath = String((attachment && attachment.storage_path) || '');
        const metadata = attachment && attachment.metadata && typeof attachment.metadata === 'object'
          ? attachment.metadata
          : {};
        const source = String(metadata.source || '');
        const isOpeningPhoto = source === 'opening_general' || /open_shop/i.test(`${fileName} ${storagePath}`);
        const isClosingPhoto = source === 'closing_general' || /close_shop/i.test(`${fileName} ${storagePath}`);
        const label = isOpeningPhoto
          ? 'รูปเปิดร้าน'
          : isClosingPhoto
            ? 'รูปปิดร้าน'
            : `รูปตรวจ ${++inspectionIndex}`;

        return { uri, label, index };
      })
      .filter(Boolean);
  }

  return (attachmentUrls || []).map((uri, index) => ({
    uri,
    label: index === 0 ? 'รูปเปิดร้าน' : `รูปตรวจ ${index}`,
    index,
  }));
}

function inspectionPendingFlex({
  inspectionId,
  branchCode,
  submitterName,
  photoCount,
  attachmentUrls = [],
  attachments = [],
  workDate,
  submitTime,
  detailUri,
  showActions = true,
}) {
  const attachmentItems = normalizeAttachmentItems({ attachments, attachmentUrls });
  const imageButtons = attachmentItems.slice(0, 3).map((item) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: {
      type: 'uri',
      label: item.label,
      uri: item.uri,
    },
  }));
  const statusBadge = {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: '#FFFBEB',
    paddingAll: 'sm',
    cornerRadius: 'md',
    margin: 'md',
    contents: [
      { type: 'text', text: 'รออนุมัติ', color: COLORS.warning, weight: 'bold', size: 'sm', align: 'center' },
    ],
  };

  return baseBubble({
    title: '⏳ ตรวจร้านรออนุมัติ',
    subtitle: `รายการ #${inspectionId}`,
    color: '#0F172A',
    altText: `ตรวจร้าน #${inspectionId} รออนุมัติ`,
    body: [
      statusBadge,
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
        infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
        infoRow('รูปแนบ', `${photoCount || 0} รูป`, '#1D4ED8'),
      ], { backgroundColor: COLORS.white, margin: 'xs' }),
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EFF6FF',
        cornerRadius: 'xl',
        paddingAll: 'md',
        margin: 'md',
        contents: [
          {
            type: 'text',
            text: 'เปิดรายละเอียดเพื่อตรวจรูปตามหัวข้อ แล้วอนุมัติหรือแจ้งปัญหาในหน้า LIFF',
            size: 'xs',
            color: COLORS.info,
            wrap: true,
          },
        ],
      },
    ],
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: COLORS.white,
        contents: [
          detailUri ? primaryButton('ดูรายละเอียด', { type: 'uri', uri: detailUri }, COLORS.info) : null,
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: imageButtons.length ? imageButtons : [
              { type: 'text', text: 'ไม่มีรูปแนบ', size: 'xs', color: '#64748B', wrap: true },
            ],
          },
        attachmentItems.length > 3 ? {
          type: 'text',
          text: `มีรูปแนบทั้งหมด ${attachmentItems.length} รูป`,
          size: 'xs',
          color: '#64748B',
          wrap: true,
          margin: 'xs',
        } : null,
        showActions ? {
          type: 'button',
          style: 'primary',
          color: '#16A34A',
          action: { type: 'postback', label: 'อนุมัติ', data: `inspect_action|${inspectionId}|approve` },
        } : null,
        showActions ? {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'มีปัญหา', data: `inspect_action|${inspectionId}|problem` },
        } : null,
      ].filter(Boolean),
    },
  });
}

function inspectionResultFlex({ inspectionId, branchCode, status, photoCount = 0, reviewedBy, reviewTime, managerNote }) {
  const ok = status === 'pass';
  return resultFlex({
    title: ok ? '✅ ตรวจร้านผ่านแล้ว' : '⚠️ ตรวจร้านพบปัญหา',
    subtitle: `รายการ #${inspectionId}`,
    statusLabel: ok ? 'อนุมัติ' : 'มีปัญหา',
    statusColor: ok ? COLORS.success : COLORS.danger,
    altText: ok ? '✅ ตรวจร้านผ่านแล้ว' : '⚠️ ตรวจร้านพบปัญหา',
    rows: [
      infoRow('สาขา', branchCode || '-'),
      infoRow('รูปแนบ', `${Number(photoCount || 0)} รูป`, COLORS.info),
      infoRow(ok ? 'ผู้อนุมัติ' : 'ผู้ตรวจ', reviewedBy || 'ผู้จัดการ'),
      infoRow('เวลาอนุมัติ', reviewTime ? `${String(reviewTime).slice(0, 5)} น.` : '-'),
      ok ? null : infoRow('หมายเหตุ', managerNote || 'พบปัญหา'),
    ].filter(Boolean),
  });
}

module.exports = {
  inspectionLiffEntryFlex,
  inspectionSummaryFlex,
  inspectionPendingFlex,
  inspectionResultFlex,
};
