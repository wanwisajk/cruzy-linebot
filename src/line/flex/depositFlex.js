const { row, card, bubble, COLORS } = require('./uiFlex');

function depositFlex({ amount, bank, diff, branchCode, depositDate, depositedBy, slipUrl }) {
  const ok = !diff || diff === 0;
  const title = ok ? 'บันทึกฝากเงิน' : 'ยอดฝากไม่ตรง';
  const color = ok ? '#0F766E' : '#B91C1C';

  return bubble({
    title,
    subtitle: `สาขา ${String(branchCode || '-')}`,
    color,
    altText: `${title} ${branchCode || ''}`.trim(),
    body: [
          card([
              row('ยอดฝาก', `${Number(amount || 0).toLocaleString()} บาท`, '#0F766E'),
              row('วันที่ฝาก', depositDate || '-'),
              row('ธนาคาร', bank || 'ไม่ระบุ'),
              row('ฝากโดย', depositedBy || 'ไม่ระบุผู้ฝาก'),
              row('สถานะ', ok ? 'รอตรวจสอบ' : 'ต้องตรวจสอบ', ok ? '#1D4ED8' : '#B91C1C'),
          ]),
          diff
            ? card([
                  { type: 'text', text: `ส่วนต่าง ${Number(diff).toLocaleString()} บาท`, color: '#B91C1C', weight: 'bold', size: 'sm' },
              ], { backgroundColor: '#FEF2F2', borderColor: '#FECACA', margin: 'sm' })
            : {
                type: 'text',
                text: 'ระบบบันทึกยอดฝากและสลิปแล้ว รอผู้จัดการตรวจสอบ',
                color: COLORS.muted,
                size: 'xs',
                wrap: true,
                margin: 'sm',
              },
    ],
    footer: slipUrl
        ? {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'button', style: 'link', action: { type: 'uri', label: 'ดูสลิป', uri: slipUrl } },
            ],
          }
        : undefined,
  });
}

module.exports = depositFlex;
