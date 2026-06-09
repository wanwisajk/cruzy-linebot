function payrollFlex({ gross, deductions, net }) {
  return {
    type: 'flex',
    altText: 'สลิปเงินเดือน',
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: 'เงินเดือน', weight: 'bold' },
      { type: 'text', text: `รวม: ${gross}` },
      { type: 'text', text: `หัก: ${deductions}` },
      { type: 'text', text: `สุทธิ: ${net}` },
      { type: 'button', action: { type: 'uri', label: 'ดูรายละเอียด', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/payroll` } }
    ] } }
  };
}

module.exports = payrollFlex;
