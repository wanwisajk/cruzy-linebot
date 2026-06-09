function inspectFlex({ items = [], ok = true }) {
  return {
    type: 'flex',
    altText: ok ? 'ตรวจร้าน: ผ่าน' : 'ตรวจพบปัญหา',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: ok ? '✅ ตรวจสาขาผ่าน' : '⚠️ พบปัญหา' },
        { type: 'text', text: items.join('\n') }
      ] }
    }
  };
}

module.exports = inspectFlex;
