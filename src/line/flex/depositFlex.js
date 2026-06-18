const { row, card, bubble, resultFlex, COLORS } = require('./uiFlex');

function depositConfirmFlex({ tempId, amount, bank, slipCount }) {
  return {
    type: 'flex',
    altText: 'ยืนยันส่งฝากเงิน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '💵 ฝากเงิน', weight: 'bold', color: '#FFFFFF', size: 'xl' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'ยอดฝาก', size: 'xs', color: COLORS.muted },
              { type: 'text', text: `${Number(amount || 0).toLocaleString()} บาท`, size: 'xxl', weight: 'bold', color: '#0F766E', align: 'end' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: 'บัญชี', size: 'xs', color: COLORS.muted },
              { type: 'text', text: bank || '-', size: 'md', weight: 'bold', color: '#1E293B' },
              { type: 'text', text: `แนบรูปแล้ว ${Number(slipCount || 0)} รูป`, size: 'sm', color: COLORS.muted, margin: 'md' },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'sm',
            spacing: 'sm',
            contents: [
              { type: 'button', style: 'primary', color: '#16A34A', height: 'sm', action: { type: 'postback', label: 'ยืนยันส่ง', data: `deposit_draft|${tempId}|send` } },
              { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ยกเลิก', data: `deposit_draft|${tempId}|cancel` } },
            ],
          },
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
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: `ฝากเงิน #${depositId}`, weight: 'bold', color: '#FFFFFF', size: 'xl' },
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
          card([
            row('ผู้ส่ง', depositedBy || '-'),
            row('สาขา', branchCode || '-'),
            row('วันที่ฝาก', depositDate || '-'),
            row('ยอดฝาก', `${Number(amount || 0).toLocaleString()} บาท`, '#0F766E'),
            row('ธนาคาร', bankShort || bankName || '-'),
            row('ชื่อบัญชี', accountName || '-'),
            row('เลขบัญชี', accountNo || '-'),
            row('เวลาแจ้ง', submittedAt || '-'),
          ], { backgroundColor: '#FFFFFF' }),
        ].filter(Boolean),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'sm',
            spacing: 'sm',
            contents: [
              slipUrls && slipUrls.length ? { type: 'button', style: 'primary', color: '#2563EB', height: 'sm', action: { type: 'uri', label: `ดูสลิป (${slipUrls.length} รูป)`, uri: slipUrls[0] } } : null,
              { type: 'button', style: 'primary', color: '#16A34A', height: 'sm', action: { type: 'postback', label: 'อนุมัติ', data: `deposit_action|${depositId}|approve` } },
              { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ไม่อนุมัติ', data: `deposit_action|${depositId}|reject` } },
            ].filter(Boolean),
          },
        ].filter(Boolean),
      },
    },
  };
}

module.exports.managerApprovalFlex = managerApprovalFlex;

function depositResultFlex({ id, branchCode, depositDate, depositedAmount, slipCount = 0, verifiedBy, verifiedAt }) {
  return resultFlex({
    title: '✅ ฝากเงินได้รับการอนุมัติ',
    subtitle: `รายการ #${id}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: '✅ ฝากเงินได้รับการอนุมัติ',
    rows: [
      row('สาขา', branchCode || '-'),
      row('วันที่ฝาก', depositDate || '-'),
      row('ยอดฝาก', `${Number(depositedAmount || 0).toLocaleString()} บาท`, COLORS.success),
      row('รูปแนบ', `${Number(slipCount || 0)} รูป`, COLORS.info),
      row('ผู้อนุมัติ', verifiedBy || '-'),
      row('เวลาอนุมัติ', verifiedAt || '-'),
    ],
  });
}

module.exports.depositResultFlex = depositResultFlex;
