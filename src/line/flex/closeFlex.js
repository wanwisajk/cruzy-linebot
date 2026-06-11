function closeFlex({ branchCode, employeeName, time }) {
  return {
    type: 'flex',
    altText: 'ปิดร้านสำเร็จ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#334155',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'ปิดร้านสำเร็จ', color: '#FFFFFF', weight: 'bold', size: 'lg' },
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
          row('เวลา', time || '-'),
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
