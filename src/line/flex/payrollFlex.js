function row(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 5 },
      { type: 'text', text: value, color, size: 'sm', weight: 'bold', align: 'end', flex: 5 },
    ],
  };
}

function money(value) {
  return `${Number(value || 0).toLocaleString()} บาท`;
}

function payrollFlex({ employeeName, gross, allowance, deductions, net, payCycle }) {
  return {
    type: 'flex',
    altText: 'สรุปเงินเดือน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'สรุปเงินเดือน', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: String(employeeName || '-'), color: '#CCFBF1', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#F8FAFC',
        contents: [
          row('รอบจ่าย', payCycle || 'ไม่ระบุ'),
          row('รายได้หลัก', money(gross)),
          row('เงินเพิ่ม', money(allowance || 0), '#047857'),
          row('รายการหัก', `-${money(deductions || 0)}`, '#B91C1C'),
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'รับสุทธิ', color: '#0F172A', weight: 'bold', size: 'md' },
              { type: 'text', text: money(net), color: '#0F766E', weight: 'bold', size: 'xl', align: 'end' },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'link', action: { type: 'uri', label: 'ดูรายละเอียด', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/payroll` } },
        ],
      },
    },
  };
}

module.exports = payrollFlex;
