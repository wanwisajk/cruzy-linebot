function openFlex({ branch, employee, time, lateBy, messageId }) {
  const late = lateBy && lateBy > 0;
  const color = late ? '#D97706' : '#0F766E';

  return {
    type: 'flex',
    altText: late ? `เปิดร้านสาย ${lateBy} นาที` : 'เปิดร้านสำเร็จ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: late ? 'เปิดร้านสาย' : 'เปิดร้านสำเร็จ', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: `สาขา ${String(branch || '-')}`, color: late ? '#FEF3C7' : '#CCFBF1', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#F8FAFC',
        contents: [
          row('ผู้เปิดร้าน', employee || '-'),
          row('เวลาเปิด', time || '-', late ? '#D97706' : '#047857'),
          row('สถานะ', late ? `สาย ${lateBy} นาที` : 'ตรงเวลา', late ? '#B45309' : '#047857'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: messageId ? 'ระบบได้รับรูปเปิดร้านแล้ว' : 'แนะนำให้ส่งรูปหน้าร้านประกอบการเปิดร้าน', color: '#64748B', size: 'xs', wrap: true, margin: 'md' },
        ],
      },
    },
  };
}

function row(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 4 },
      { type: 'text', text: String(value || '-'), color, size: 'sm', weight: 'bold', align: 'end', flex: 6, wrap: true },
    ],
  };
}

module.exports = openFlex;
