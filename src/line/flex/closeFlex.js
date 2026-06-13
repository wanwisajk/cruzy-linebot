function closeFlex({ branchCode, employeeName, time, expectedTime, closedEarlyBy }) {
  const early = closedEarlyBy && closedEarlyBy > 0;
  return {
    type: 'flex',
    altText: early ? `ปิดร้านก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดร้านสำเร็จ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: early ? '#D97706' : '#334155',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: early ? 'ปิดร้านก่อนเวลา' : 'ปิดร้านสำเร็จ', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: `สาขา ${String(branchCode || '-')}`, color: '#CBD5E1', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#F8FAFC',
        contents: [
          row('ผู้รายงาน', employeeName || '-'),
          row('เวลาปิด', time || '-', early ? '#D97706' : '#111827'),
          row('เวลาตามตาราง', expectedTime ? String(expectedTime).slice(0, 5) : '-'),
          row('สถานะ', early ? `ก่อนเวลา ${closedEarlyBy} นาที` : 'ปิดตามเวลา', early ? '#B45309' : '#047857'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ขั้นตอนถัดไป: ส่งรายงานยอดขายและฝากเงินสดประจำวัน', color: '#64748B', size: 'xs', wrap: true, margin: 'md' },
        ],
      },
    },
  };
}

function row(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 4 },
      { type: 'text', text: String(value || '-'), color: '#111827', size: 'sm', weight: 'bold', align: 'end', flex: 6, wrap: true },
    ],
  };
}

module.exports = closeFlex;
