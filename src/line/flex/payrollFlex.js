const { buildConfiguredLiffUrl } = require('../utils/liff');

function row(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'baseline',
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
  const payrollUri = buildConfiguredLiffUrl('payroll');

  return {
    type: 'flex',
    altText: 'สรุปเงินเดือน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'สรุปเงินเดือน', color: '#FFFFFF', weight: 'bold', size: 'xl' },
          { type: 'text', text: String(employeeName || '-'), color: '#CCFBF1', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#F8FAFC',
        paddingAll: 'lg',
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
              row('รอบจ่าย', payCycle || 'ไม่ระบุ'),
              row('รายได้หลัก', money(gross)),
              row('เงินเพิ่ม', money(allowance || 0), '#047857'),
              row('รายการหัก', `-${money(deductions || 0)}`, '#B91C1C'),
            ],
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            backgroundColor: '#ECFDF5',
            borderColor: '#A7F3D0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            contents: [
              { type: 'text', text: 'รับสุทธิ', color: '#0F172A', weight: 'bold', size: 'md' },
              { type: 'text', text: money(net), color: '#0F766E', weight: 'bold', size: 'xxl', align: 'end' },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#16A34A', action: { type: 'uri', label: 'ดูรายละเอียด', uri: payrollUri } },
        ],
      },
    },
  };
}

module.exports = payrollFlex;
