const { COLORS, row, card, bubble } = require('./uiFlex');

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
}

function closeFlex({ branchCode, employeeName, time, expectedTime, closedEarlyBy, messageId, photoCount, imageReceivedAt, attachmentUrl }) {
  const early = closedEarlyBy && closedEarlyBy > 0;
  
  // อิงเฉดสีตาม Palette ใหม่ของระบบ
  const headerColor = early ? COLORS.warning : COLORS.ink; 
  const statusColor = early ? COLORS.danger : COLORS.success;

  return bubble({
    title: early ? '⚠️ ปิดร้านก่อนเวลา' : '🔒 ปิดร้านสำเร็จ',
    subtitle: `สาขา ${String(branchCode || '-')}`,
    color: headerColor,
    altText: early ? `ปิดร้านก่อนเวลา ${closedEarlyBy} นาที` : 'รายงานปิดร้านสำเร็จ',
    body: [
      card([
        row('👤 ผู้รายงาน', employeeName || '-'),
        row('⏰ เวลาปิด', time || '-', early ? COLORS.warning : COLORS.ink),
        row('📅 เวลาตามตาราง', expectedTime ? `${String(expectedTime).slice(0, 5)} น.` : '-'),
        row('📌 สถานะ', early ? `ก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดตามเวลา', statusColor),
        row('📸 รูปปิดร้าน', messageId ? `${photoCount || 1} รูป` : 'ยังไม่มีรูป', messageId ? COLORS.success : COLORS.danger),
        row('⏳ เวลารับรูป', formatDateTime(imageReceivedAt)),
        
        // Alert Box แจ้งเตือนสถานะท้ายการ์ดแบบไร้ขอบ (ซอฟต์และโมเดิร์นขึ้น)
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          paddingAll: 'md',
          backgroundColor: early ? '#FFFBEB' : '#F0FDF4', // ส้มครีมอ่อน หรือ เขียวมิ้นต์อ่อน ตามความเหมาะสม
          cornerRadius: 'md',
          contents: [
            { 
              type: 'text', 
              text: early ? '📝 ปิดก่อนเวลา ควรตรวจสอบเวลาปิดร้านรอบถัดไป' : '✨ ปิดร้านตามเวลาเรียบร้อย', 
              color: early ? '#B45309' : COLORS.success, 
              size: 'xs', 
              weight: 'bold', 
              wrap: true 
            },
            attachmentUrl ? { 
              type: 'text', 
              text: '📎 แนบไฟล์รูปปิดร้านเรียบร้อย', 
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

module.exports = closeFlex;