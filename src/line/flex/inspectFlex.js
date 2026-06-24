const { COLORS, row: infoRow, card, bubble: baseBubble, resultFlex, primaryButton } = require('./uiFlex');

function statusPill(text, color, backgroundColor) {
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor,
    paddingStart: 'md',
    paddingEnd: 'md',
    paddingTop: 'xs',
    paddingBottom: 'xs',
    cornerRadius: 'sm',
    contents: [
      { type: 'text', text, color, weight: 'bold', size: 'xs', align: 'center', wrap: true },
    ],
  };
}

function notePanel(text, options = {}) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: options.backgroundColor || '#F8FAFC',
    cornerRadius: 'md',
    paddingAll: 'md',
    margin: options.margin || 'md',
    borderWidth: '1px',
    borderColor: '#E2E8F0',
    contents: [
      {
        type: 'text',
        text,
        size: options.size || 'xs',
        color: options.color || '#64748B',
        weight: options.weight,
        wrap: true,
        lineSpacing: '3px',
      },
    ],
  };
}

function metricPanel(label, value, color = '#0F766E') {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#F0FDF4',
    cornerRadius: 'md',
    paddingAll: 'md',
    margin: 'md',
    contents: [
      { type: 'text', text: label, color: '#16A34A', size: 'xs', weight: 'bold' },
      { type: 'text', text: String(value || '-'), weight: 'bold', size: 'md', color, margin: 'xs', wrap: true },
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
      { type: 'box', layout: 'vertical', margin: 'md', contents: [] }, // Spacer
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
      ], { backgroundColor: '#FFFFFF', margin: 'xs' }),
      metricPanel('ขั้นตอนถัดไป', 'เปิดแบบฟอร์มและอัปโหลดรูป'),
      notePanel('กรอกรายการตรวจ รูปภาพ และหมายเหตุทั้งหมดในหน้าเดียว หลังส่งแล้วระบบจะแจ้งผู้อนุมัติอัตโนมัติ'),
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
          height: 'sm', 
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
        const label = isClosingPhoto ? 'รูปปิดร้าน' : `รูปตรวจ ${++inspectionIndex}`;

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
    color: '#D97706', 
    altText: `ตรวจร้าน #${inspectionId} รออนุมัติ`,
    body: [
      statusPill('👀 รอผู้จัดการตรวจสอบ', '#D97706', '#FEF3C7'),
      { type: 'box', layout: 'vertical', margin: 'md', contents: [] }, // Spacer
      card([
        infoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
        infoRow('ผู้ตรวจ', submitterName || 'ไม่ระบุ'),
        infoRow('วันที่', workDate || '-'),
        infoRow('เวลา', submitTime ? String(submitTime).slice(0, 5) : '-'),
        infoRow('รูปแนบ', `${photoCount || 0} รูป`, '#2563EB'),
      ], { backgroundColor: COLORS.white, margin: 'xs' }),
      notePanel('เปิดรายละเอียดเพื่อดูรูปและเช็กลิสต์ จากนั้นอนุมัติหรือไม่อนุมัติในหน้า LIFF พร้อมหมายเหตุ', {
        backgroundColor: '#EFF6FF',
        color: '#1E40AF',
      }),
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      backgroundColor: COLORS.white,
      contents: [
        safeDetailUri ? primaryButton('ดูรายละเอียด', { type: 'uri', uri: safeDetailUri }, '#2563EB') : null,
        {
          type: 'text',
          text: safeDetailUri ? '💡 ดูรูป เช็กลิสต์ หมายเหตุ และบันทึกผลใน LIFF' : '❌ ไม่มีลิงก์รายละเอียด',
          size: 'xs',
          color: '#64748B',
          align: 'center',
          wrap: true,
          margin: 'sm'
        },
        attachmentItems.length > 0 ? {
          type: 'text',
          text: `📸 มีรูปแนบทั้งหมด ${attachmentItems.length} รูป`,
          size: 'xs',
          color: '#64748B',
          align: 'center',
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
    statusLabel: ok ? 'อนุมัติผ่าน' : 'ไม่อนุมัติ',
    statusColor: ok ? '#10B981' : '#EF4444',
    altText: ok ? 'ตรวจร้านผ่านแล้ว' : 'ตรวจร้านไม่อนุมัติ',
    rows: [
      infoRow('สาขา', branchCode || '-'),
      infoRow('รูปแนบ', `${Number(photoCount || 0)} รูป`, '#2563EB'),
      infoRow(ok ? 'ผู้อนุมัติ' : 'ผู้แจ้งปัญหา', reviewedBy || 'ผู้จัดการ'),
      infoRow(ok ? 'เวลาอนุมัติ' : 'เวลาแจ้งปัญหา', reviewTime ? `${String(reviewTime).slice(0, 5)} น.` : '-'),
      ok ? null : infoRow('หมายเหตุ', managerNote || 'พบปัญหา', '#EF4444'),
    ].filter(Boolean),
  });
}

module.exports = {
  inspectionLiffEntryFlex,
  inspectionPendingFlex,
  inspectionResultFlex,
};
