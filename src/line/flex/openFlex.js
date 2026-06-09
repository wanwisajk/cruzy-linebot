function openFlex({ branch, employee, time, lateBy, messageId, mediaUrl }) {
  const late = lateBy && lateBy > 0;
  return {
    type: 'flex',
    altText: late ? `เปิดร้าน (สาย ${lateBy} นาที)` : 'เปิดร้านเรียบร้อย',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: late ? '⚠️ เปิดร้านสาย' : '✅ เปิดร้านสำเร็จ', weight: 'bold', size: 'lg' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `สาขา: ${branch || 'ไม่ระบุ'}` },
          { type: 'text', text: `พนักงาน: ${employee || 'ไม่ระบุ'}` },
          { type: 'text', text: `เวลา: ${time}` },
          late ? { type: 'text', text: `สาย: ${lateBy} นาที`, color: '#ff3b30' } : { type: 'text', text: 'ตรงเวลา', color: '#16a34a' },
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'button', style: 'link', action: { type: 'uri', label: 'ดูรูป', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/media/${messageId}` } },
            { type: 'button', style: 'link', action: { type: 'uri', label: 'Dashboard', uri: `${process.env.LIFF_URL || 'https://liff.example.com'}/dashboard` } }
          ] }
        ]
      }
    }
  };
}

module.exports = openFlex;
