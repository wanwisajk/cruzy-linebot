function leaveFlex({ id, type, from, to, reason, approveData, rejectData }) {
  return {
    type: 'flex',
    altText: 'คำขออนุมัติลา',
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: `ขอลา: ${type}`, weight: 'bold' },
        { type: 'text', text: `ตั้งแต่: ${from}` },
        { type: 'text', text: `ถึง: ${to}` },
        { type: 'text', text: `เหตุผล: ${reason}` },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'button', style: 'primary', action: { type: 'postback', label: 'อนุมัติ', data: approveData } },
          { type: 'button', action: { type: 'postback', label: 'ปฏิเสธ', data: rejectData } }
        ] }
      ] }
    }
  };
}

module.exports = leaveFlex;
