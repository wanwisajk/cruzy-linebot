const { row, card, bubble, COLORS } = require('./uiFlex');

function depositConfirmFlex({ tempId, amount, bank, slipCount }) {
  return {
    type: 'flex',
    altText: 'ยืนยันส่งฝากเงิน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '💵 ฝากเงิน', weight: 'bold', color: '#FFFFFF', size: 'lg' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'ยอดฝาก', size: 'xs', color: COLORS.muted },
          { type: 'text', text: `${Number(amount || 0).toLocaleString()} บาท`, size: 'xl', weight: 'bold', color: '#0F766E' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'บัญชี', size: 'xs', color: COLORS.muted },
          { type: 'text', text: bank || '-', size: 'md', weight: 'bold', color: '#111827' },
          { type: 'text', text: `แนบรูปแล้ว ${Number(slipCount || 0)} รูป`, size: 'sm', color: COLORS.muted, margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          { type: 'button', style: 'primary', color: '#16A34A', action: { type: 'postback', label: 'ยืนยันส่ง', data: `deposit_draft|${tempId}|send` } },
          { type: 'button', style: 'secondary', action: { type: 'postback', label: 'ยกเลิก', data: `deposit_draft|${tempId}|cancel` } },
        ],
      },
    },
  };
}

module.exports.depositConfirmFlex = depositConfirmFlex;

function managerApprovalFlex({
  depositId,
  branchCode,
  depositDate,
  amount,
  bankShort,
  bankName,
  accountName,
  accountNo,
  slipCount,
  slipUrls,
  submittedAt,
  lineUserId,
  messageText,
  source,
  depositedBy,
}) {
  return {
    type: 'flex',
    altText: `ฝากเงิน #${depositId} รออนุมัติ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: `ฝากเงิน #${depositId}`, weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: 'รอผู้จัดการตรวจและอนุมัติ', size: 'xs', color: '#E0F2FE', wrap: true, margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          row('ผู้ส่ง', depositedBy || '-'),
          row('สาขา', branchCode || '-'),
          row('วันที่ฝาก', depositDate || '-'),
          row('ยอดฝาก', `${Number(amount || 0).toLocaleString()} บาท`, '#0F766E'),
          row('ธนาคาร', bankShort || bankName || '-'),
          row('ชื่อบัญชี', accountName || '-'),
          row('เลขบัญชี', accountNo || '-'),
          row('เวลาแจ้ง', submittedAt || '-'),
        ].filter(Boolean),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          slipUrls && slipUrls.length ? { type: 'button', style: 'link', action: { type: 'uri', label: `ดูสลิป (${slipUrls.length} รูป)`, uri: slipUrls[0] } } : null,
          { type: 'button', style: 'primary', color: '#16A34A', action: { type: 'postback', label: 'อนุมัติ', data: `deposit_action|${depositId}|approve` } },
          { type: 'button', style: 'secondary', action: { type: 'postback', label: 'ไม่อนุมัติ', data: `deposit_action|${depositId}|reject` } },
        ].filter(Boolean),
      },
    },
  };
}

module.exports.managerApprovalFlex = managerApprovalFlex;

function depositResultFlex({ verifiedBy, verifiedAt }) {
  return {
    type: 'flex',
    altText: '✅ อนุมัติฝากเงินเรียบร้อย',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '✅ ฝากเงินได้รับการอนุมัติ', weight: 'bold', color: '#FFFFFF', size: 'lg' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          row('ผู้อนุมัติ', verifiedBy || '-'),
          row('เวลาอนุมัติ', verifiedAt || '-'),
        ],
      },
    },
  };
}

module.exports.depositResultFlex = depositResultFlex;
