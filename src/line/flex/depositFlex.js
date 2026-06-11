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

function depositFlex({ amount, bank, diff, branchCode, depositDate, depositedBy, slipUrl }) {
  const ok = !diff || diff === 0;
  const title = ok ? 'บันทึกฝากเงิน' : 'ยอดฝากไม่ตรง';
  const color = ok ? '#0F766E' : '#B91C1C';

  return {
    type: 'flex',
    altText: `${title} ${branchCode || ''}`.trim(),
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: `สาขา ${String(branchCode || '-')}`, color: '#D1FAE5', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#F8FAFC',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'sm',
            contents: [
              row('ยอดฝาก', `${Number(amount || 0).toLocaleString()} บาท`, '#0F766E'),
              row('วันที่ฝาก', depositDate || '-'),
              row('ธนาคาร', bank || 'ไม่ระบุ'),
              row('ฝากโดย', depositedBy || 'ไม่ระบุผู้ฝาก'),
              row('สถานะ', ok ? 'รอตรวจสอบ' : 'ต้องตรวจสอบ', ok ? '#1D4ED8' : '#B91C1C'),
            ],
          },
          diff
            ? {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                borderWidth: '1px',
                cornerRadius: 'md',
                paddingAll: 'md',
                margin: 'sm',
                contents: [
                  { type: 'text', text: `ส่วนต่าง ${Number(diff).toLocaleString()} บาท`, color: '#B91C1C', weight: 'bold', size: 'sm' },
                ],
              }
            : {
                type: 'text',
                text: 'ระบบบันทึกยอดฝากและสลิปแล้ว รอผู้จัดการตรวจสอบ',
                color: '#64748B',
                size: 'xs',
                wrap: true,
                margin: 'sm',
              },
        ],
      },
      footer: slipUrl
        ? {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'button', style: 'link', action: { type: 'uri', label: 'ดูสลิป', uri: slipUrl } },
            ],
          }
        : undefined,
    },
  };
}

module.exports = depositFlex;
