function commandFlex() {
  return {
    type: 'flex',
    altText: 'คำสั่ง Cruzy Bot',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#111827',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'คำสั่ง Cruzy Bot', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'ใช้ในกลุ่มสาขาและไลน์ส่วนตัว', color: '#CBD5E1', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#F8FAFC',
        contents: [
          section('ใช้ในกลุ่มสาขา', [
            'ยอดขาย CCA ...',
            'ฝาก CCA 29,880 แล้วส่งรูปสลิป 1 รูป',
            'เปิดร้าน CCA',
            'ปิดร้าน CCA',
          ]),
          section('ใช้ในไลน์ส่วนตัว', [
            'ขอลา',
            'เงินเดือน',
            'หนังสือเตือน',
            'แจ้งเตือน',
          ]),
        ],
      },
    },
  };
}

function section(title, items) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: '1px',
    cornerRadius: 'md',
    paddingAll: 'md',
    spacing: 'sm',
    contents: [
      { type: 'text', text: title, color: '#0F172A', weight: 'bold', size: 'sm' },
      ...items.map((item) => ({ type: 'text', text: item, color: '#475569', size: 'xs', wrap: true })),
    ],
  };
}

module.exports = commandFlex;
