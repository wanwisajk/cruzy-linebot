function warningFlex({ id, employeeName, level, issueDate, note, status, signed }) {
  return {
    type: 'flex',
    altText: 'หนังสือเตือน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#B91C1C',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'หนังสือเตือน', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: String(level || 'ไม่ระบุระดับ'), color: '#FEE2E2', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FEF2F2',
        contents: [
          row('เลขที่', id ? `#${id}` : '-'),
          row('พนักงาน', employeeName || '-'),
          row('วันที่ออก', issueDate || '-'),
          row('สถานะ', signed ? 'เซ็นรับทราบแล้ว' : (status || 'รอรับทราบ'), signed ? '#047857' : '#B91C1C'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'สาเหตุ', color: '#7F1D1D', weight: 'bold', size: 'sm', margin: 'md' },
          { type: 'text', text: String(note || '-'), color: '#450A0A', size: 'sm', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'link', action: { type: 'uri', label: 'เปิดเอกสาร', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/warnings/${id || ''}` } },
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
      { type: 'text', text: label, color: '#7F1D1D', size: 'sm', flex: 4 },
      { type: 'text', text: String(value || '-'), color, size: 'sm', weight: 'bold', align: 'end', flex: 6, wrap: true },
    ],
  };
}

module.exports = warningFlex;
