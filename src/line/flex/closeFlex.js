const { row, card, bubble } = require('./uiFlex');

function closeFlex({ branchCode, employeeName, time, expectedTime, closedEarlyBy }) {
  const early = closedEarlyBy && closedEarlyBy > 0;
  return bubble({
    title: early ? 'ปิดร้านก่อนเวลา' : 'ปิดร้านสำเร็จ',
    subtitle: `สาขา ${String(branchCode || '-')}`,
    color: early ? '#D97706' : '#334155',
    altText: early ? `ปิดร้านก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดร้านสำเร็จ',
    body: [
          card([
          row('ผู้รายงาน', employeeName || '-'),
          row('เวลาปิด', time || '-', early ? '#D97706' : '#111827'),
          row('เวลาตามตาราง', expectedTime ? String(expectedTime).slice(0, 5) : '-'),
          row('สถานะ', early ? `ก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดตามเวลา', early ? '#B45309' : '#047857'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ขั้นตอนถัดไป: ส่งรายงานยอดขายและฝากเงินสดประจำวัน', color: '#64748B', size: 'xs', wrap: true, margin: 'md' },
          ]),
    ],
  });
}

module.exports = closeFlex;
