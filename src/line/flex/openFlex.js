const { COLORS, row, card, bubble } = require('./uiFlex');

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

function openFlex({ branch, branchName, employee, time, expectedTime, lateBy, messageId, messageText, photoCount, imageReceivedAt, attachmentUrl }) {
  const late = lateBy && lateBy > 0;
  const headerColor = late ? COLORS.warning : COLORS.teal; 
  const statusColor = late ? COLORS.danger : COLORS.success;

  return bubble({
    title: late ? 'เปิดร้านสาย' : 'เปิดร้านสำเร็จ',
    subtitle: `สาขา ${String(branch || '-')}`,
    color: headerColor,
    altText: late ? `เปิดร้านสาย ${lateBy} นาที` : 'เปิดร้านสำเร็จเรียบร้อย',
    body: [
      card([
        row('ผู้เปิดร้าน', employee || '-'),
        row('สาขา', branchName ? `${branch} - ${branchName}` : branch || '-'),
        row('เวลาเปิด', time || '-', late ? COLORS.warning : COLORS.success),
        row('เวลาเข้างาน', expectedTime ? `${String(expectedTime).slice(0, 5)} น.` : '-'),
        row('สถานะ', late ? `สาย ${lateBy} นาที` : 'ตรงเวลา', statusColor),
        row('รูปหน้าร้าน', messageId ? `${photoCount || 1} รูป` : 'ยังไม่มีรูป', messageId ? COLORS.success : COLORS.danger),
        row('เวลารับรูป', formatDateTime(imageReceivedAt)),
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          paddingAll: 'md',
          backgroundColor: late ? '#FFFBEB' : '#F0FDF4', // พื้นส้มอ่อนหรือเขียวอ่อนตามความเหมาะสม
          cornerRadius: 'md',
          contents: [
            { 
              type: 'text', 
              text: 'ข้อมูลเปิดร้านถูกบันทึกเข้าระบบแล้ว', 
              color: late ? '#B45309' : COLORS.success, 
              size: 'xs', 
              weight: 'bold', 
              wrap: true 
            },
            messageText ? { 
              type: 'text', 
              text: `ข้อความ: ${messageText}`, 
              color: COLORS.muted, 
              size: 'xs', 
              margin: 'xs', 
              wrap: true 
            } : null,
            attachmentUrl ? { 
              type: 'text', 
              text: 'แนบไฟล์รูปหน้าร้านเรียบร้อย', 
              color: COLORS.muted, 
              size: 'xs', 
              margin: 'xs', 
              wrap: true 
            } : null,
          ].filter(Boolean),
        },
      ].filter(Boolean)),
    ],
  });
}

module.exports = openFlex;
