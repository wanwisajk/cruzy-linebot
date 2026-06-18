const { row, card, bubble } = require('./uiFlex');

function closeFlex({ branchCode, employeeName, time, expectedTime, closedEarlyBy }) {
  const early = closedEarlyBy && closedEarlyBy > 0;
  return bubble({
    title: early ? 'ปิดร้านก่อนเวลา' : 'ปิดร้านสำเร็จ',
    subtitle: `สาขา ${String(branchCode || '-')}`,
    color: early ? '#D97706' : '#0F766E',
    altText: early ? `ปิดร้านก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดร้านสำเร็จ',
    body: [
      card([
        row('ผู้รายงาน', employeeName || '-'),
        row('เวลาปิด', time || '-', early ? '#D97706' : '#1E293B'),
        row('เวลาตามตาราง', expectedTime ? String(expectedTime).slice(0, 5) : '-', '#1E293B'),
        row('สถานะ', early ? `ก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดตามเวลา', early ? '#B45309' : '#047857'),
        { type: 'separator', margin: 'md' },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: early ? '#FFFBEB' : '#ECFDF5',
          borderColor: early ? '#FCD34D' : '#A7F3D0',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'md',
          contents: [
            { type: 'text', text: early ? 'ปิดก่อนเวลา ควรตรวจสอบเวลาปิดร้านรอบถัดไป' : 'ปิดตามเวลาเรียบร้อย', color: early ? '#B45309' : '#047857', size: 'xs', weight: 'bold', wrap: true },
          ],
        },
      ], { backgroundColor: '#FFFFFF' }),
    ],
  });
}

module.exports = closeFlex;
