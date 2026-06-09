function depositFlex({ amount, bank, diff }) {
  const ok = !diff || diff === 0;
  return {
    type: 'flex',
    altText: ok ? 'ฝากเงินตรง' : 'ฝากเงินไม่ตรง',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: ok ? '✅ ยอดฝากตรง' : '❌ ยอดฝากไม่ตรง', weight: 'bold' },
        { type: 'text', text: `ยอด: ${amount}` },
        { type: 'text', text: `ธนาคาร: ${bank || '-'}` },
        diff ? { type: 'text', text: `ต่าง: ${diff}`, color: '#ff3b30' } : { type: 'text', text: 'ยอดตรงกัน' }
      ] }
    }
  };
}

module.exports = depositFlex;
