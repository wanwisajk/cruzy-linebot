function salesFlex({ cash, credit, qr, total }) {
  return {
    type: 'flex',
    altText: 'ยืนยันยอดขาย',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'สรุปยอดขาย', weight: 'bold', size: 'lg' },
        { type: 'text', text: `เงินสด: ${cash || 0}` },
        { type: 'text', text: `บัตร: ${credit || 0}` },
        { type: 'text', text: `QR: ${qr || 0}` },
        { type: 'text', text: `รวม: ${total || 0}` },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'button', style: 'primary', action: { type: 'message', label: 'ยืนยันยอด', text: 'ยืนยันยอด' } },
          // { type: 'button', action: { type: 'uri', label: 'แก้ไขยอด', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/edit` } }
        ] }
      ] }
    }
  };
}

module.exports = salesFlex;
