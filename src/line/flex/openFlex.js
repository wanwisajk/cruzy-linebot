const { row, card, bubble } = require('./uiFlex');

function openFlex({ branch, employee, time, expectedTime, lateBy, messageId }) {
  const late = lateBy && lateBy > 0;
  const color = late ? '#D97706' : '#0F766E';

  return bubble({
    title: late ? 'เปิดร้านสาย' : 'เปิดร้านสำเร็จ',
    subtitle: `สาขา ${String(branch || '-')}`,
    color,
    altText: late ? `เปิดร้านสาย ${lateBy} นาที` : 'เปิดร้านสำเร็จ',
    body: [
          card([
          row('ผู้เปิดร้าน', employee || '-'),
          row('เวลาเปิด', time || '-', late ? '#D97706' : '#047857'),
          row('เวลาเข้างาน', expectedTime ? String(expectedTime).slice(0, 5) : '-'),
          row('สถานะ', late ? `สาย ${lateBy} นาที` : 'ตรงเวลา', late ? '#B45309' : '#047857'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: messageId ? 'ระบบได้รับรูปเปิดร้านแล้ว' : 'แนะนำให้ส่งรูปหน้าร้านประกอบการเปิดร้าน', color: '#64748B', size: 'xs', wrap: true, margin: 'md' },
          ]),
    ],
  });
}

module.exports = openFlex;
