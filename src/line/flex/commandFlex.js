function commandFlex() {
  return {
    type: 'flex',
    altText: 'คำสั่ง Cruzy Bot',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#111827',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '✨ คำสั่ง Cruzy Bot', color: '#FFFFFF', weight: 'bold', size: 'xl' },
          { type: 'text', text: 'เลือกใช้ตามงานในกลุ่มสาขาและไลน์ส่วนตัว', color: '#CBD5E1', size: 'xs', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#F8FAFC',
        paddingAll: 'lg',
        contents: [
          section('🏪 ใช้ในกลุ่มสาขา', [
            '🔗 #สาขา CCA (ใช้ครั้งแรกเพื่อผูกกลุ่ม)',
            '💰 #ยอดขาย พร้อมยอดเงิน',
            '🏧 #ฝากเงิน 15/06/2026 ฝากเงิน 1,500',
            '🚪 #เปิดร้าน',
            '🌙 #ปิดร้าน',
            '🔍 #ตรวจร้าน แล้วกดปุ่มเปิดหน้าตรวจร้าน',
            '📅 #ตาราง หรือ #ตาราง 1/6-7/6',
            '⚠️ #ตารางคนขาด',
          ]),
          section('👤 ใช้ในไลน์ส่วนตัว', [
            '🔗 #พนักงาน EMP001',
            '🏖️ #ขอลางาน',
            '📅 #ตาราง หรือ #ตาราง 1/6-7/6',
            '💵 #เงินเดือน',
            '📄 #หนังสือเตือน',
            '🔔 #แจ้งเตือน',
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
      { type: 'text', text: title, color: '#0F172A', weight: 'bold', size: 'md' },
      ...items.map((item) => ({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8FAFC',
        borderColor: '#E2E8F0',
        borderWidth: '1px',
        cornerRadius: 'md',
        paddingAll: 'sm',
        contents: [{ type: 'text', text: item, color: '#334155', size: 'xs', wrap: true }],
      })),
    ],
  };
}

module.exports = commandFlex;
