const { COLORS, row: infoRow, card, bubble: baseBubble, resultFlex, primaryButton } = require('./uiFlex');

function statusPill(text, color, backgroundColor) {
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor,
    paddingAll: 'sm',
    cornerRadius: 'md',
    contents: [
      { type: 'text', text, color, weight: 'bold', size: 'sm', align: 'center', wrap: true },
    ],
  };
}

function notePanel(text, options = {}) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: options.backgroundColor || '#EFF6FF',
    cornerRadius: 'xl',
    paddingAll: 'md',
    margin: options.margin || 'md',
    contents: [
      {
        type: 'text',
        text,
        size: options.size || 'xs',
        color: options.color || COLORS.info,
        weight: options.weight,
        wrap: true,
      },
    ],
  };
}

function metricPanel(label, value, color = COLORS.teal) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#F0FDF4',
    cornerRadius: 'xl',
    paddingAll: 'lg',
    margin: 'md',
    contents: [
      { type: 'text', text: label, color: COLORS.success, size: 'xs', weight: 'bold', wrap: true },
      { type: 'text', text: String(value || '-'), align: 'end', weight: 'bold', size: 'xl', color, margin: 'xs', wrap: true },
    ],
  };
}

function inspectionLiffEntryFlex({ branchCode, submitterName, workDate, uri }) {
  return baseBubble({
    title: '🔍 เปิดหน้าตรวจร้าน',
    subtitle: branchCode ? `สาขา ${branchCode}` : 'เปิดแบบฟอร์มตรวจร้าน',
    color: '#0F766E',
    altText: `เปิดหน้าตรวจร้าน ${branchCode || ''}`,
    body: [
      statusPill('📝 กรอกข้อมูลใน LIFF', '#0F766E', '#CCFBF1'),
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
      ], { backgroundColor: '#FFFFFF', margin: 'xs' }),
      metricPanel('ขั้นตอนถัดไป', 'เปิดแบบฟอร์มและอัปโหลดรูป'),
      notePanel('กรอกรายการตรวจ รูปภาพ และหมายเหตุทั้งหมดในหน้าเดียว หลังส่งแล้วระบบจะแจ้งผู้อนุมัติอัตโนมัติ', {
        backgroundColor: '#F8FAFC',
        color: COLORS.muted,
      }),
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
          action: { type: 'uri', label: 'เปิดหน้าตรวจร้าน', uri },
        },
      ],
    },
  });
}

function isLineUriActionSafe(uri) {
  const value = String(uri || '').trim();
  return /^https?:\/\//i.test(value) && value.length <= 1000;
}

function normalizeAttachmentItems({ attachments, attachmentUrls }) {
  if (Array.isArray(attachments) && attachments.length > 0) {
    let inspectionIndex = 0;
    return attachments
      .map((attachment, index) => {
        const uri = attachment && (attachment.file_url || attachment.url || attachment.uri);
        if (!isLineUriActionSafe(uri)) return null;

        const fileName = String((attachment && attachment.file_name) || '');
        const storagePath = String((attachment && attachment.storage_path) || '');
        const metadata = attachment && attachment.metadata && typeof attachment.metadata === 'object'
          ? attachment.metadata
          : {};
        const source = String(metadata.source || '');
        const isOpeningPhoto = source === 'opening_general' || /open_shop/i.test(`${fileName} ${storagePath}`);
        const isClosingPhoto = source === 'closing_general' || /close_shop/i.test(`${fileName} ${storagePath}`);
        if (isOpeningPhoto) return null;

        const label = isOpeningPhoto
          ? 'รูปเปิดร้าน'
          : isClosingPhoto
            ? 'รูปปิดร้าน'
            : `รูปตรวจ ${++inspectionIndex}`;

        return { uri: String(uri).trim(), label, index };
      })
      .filter(Boolean);
  }

  return (attachmentUrls || [])
    .filter(isLineUriActionSafe)
    .map((uri, index) => ({
      uri: String(uri).trim(),
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
}) {
  const safeDetailUri = isLineUriActionSafe(detailUri) ? String(detailUri).trim() : null;
  const attachmentItems = normalizeAttachmentItems({ attachments, attachmentUrls });
  return baseBubble({
    title: '⏳ ตรวจร้านรออนุมัติ',
    subtitle: branchCode ? `สาขา ${branchCode} · รายการ #${inspectionId}` : `รายการ #${inspectionId}`,
    color: '#0F766E',
    altText: `ตรวจร้าน #${inspectionId} รออนุมัติ`,
    body: [
      statusPill('👀 รอผู้จัดการตรวจสอบ', COLORS.warning, '#FFFBEB'),
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
        infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
        infoRow('รูปแนบ', `${photoCount || 0} รูป`, '#1D4ED8'),
      ], { backgroundColor: COLORS.white, margin: 'xs' }),
      notePanel('เปิดรายละเอียดเพื่อดูรูปและเช็กลิสต์ จากนั้นอนุมัติหรือไม่อนุมัติในหน้า LIFF พร้อมหมายเหตุ', {
        backgroundColor: '#EFF6FF',
        color: COLORS.info,
      }),
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      backgroundColor: COLORS.white,
      contents: [
        safeDetailUri ? primaryButton('ดูรายละเอียด', { type: 'uri', uri: safeDetailUri }, COLORS.info) : null,
        {
          type: 'text',
          text: safeDetailUri ? 'ดูรูป เช็กลิสต์ หมายเหตุ และบันทึกผลใน LIFF' : 'ไม่มีลิงก์รายละเอียด',
          size: 'xs',
          color: '#64748B',
          wrap: true,
        },
        attachmentItems.length > 0 ? {
          type: 'text',
          text: `มีรูปแนบทั้งหมด ${attachmentItems.length} รูป`,
          size: 'xs',
          color: '#64748B',
          wrap: true,
          margin: 'xs',
        } : null,
      ].filter(Boolean),
    },
  });
}

function inspectionResultFlex({ inspectionId, branchCode, status, photoCount = 0, reviewedBy, reviewTime, managerNote }) {
  const ok = status === 'pass';
  return resultFlex({
    title: ok ? '✅ ตรวจร้านผ่านแล้ว' : '⚠️ ตรวจร้านไม่อนุมัติ',
    subtitle: branchCode ? `สาขา ${branchCode} · รายการ #${inspectionId}` : `รายการ #${inspectionId}`,
    statusLabel: ok ? 'อนุมัติ' : 'ไม่อนุมัติ',
    statusColor: ok ? COLORS.teal : COLORS.danger,
    altText: ok ? 'ตรวจร้านผ่านแล้ว' : 'ตรวจร้านไม่อนุมัติ',
    rows: [
      infoRow('สาขา', branchCode || '-'),
      infoRow('รูปแนบ', `${Number(photoCount || 0)} รูป`, COLORS.info),
      infoRow(ok ? 'ผู้อนุมัติ' : 'ผู้แจ้งปัญหา', reviewedBy || 'ผู้จัดการ'),
      infoRow(ok ? 'เวลาอนุมัติ' : 'เวลาแจ้งปัญหา', reviewTime ? `${String(reviewTime).slice(0, 5)} น.` : '-'),
      ok ? null : infoRow('หมายเหตุ', managerNote || 'พบปัญหา'),
    ].filter(Boolean),
  });
}

module.exports = {
  inspectionLiffEntryFlex,
  inspectionPendingFlex,
  inspectionResultFlex,
};
