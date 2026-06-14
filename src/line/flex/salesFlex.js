const { COLORS, row: uiRow, resultFlex } = require('./uiFlex');

function salesAmountRow(label, amount, color = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm' },
      {
        type: 'text',
        text: `${Number(amount || 0).toLocaleString()} บาท`,
        align: 'end',
        weight: 'bold',
        color,
        size: 'sm'
      }
    ]
  };
}

function salesInfoRow(label, value, color = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#64748B', size: 'sm', flex: 4 },
      {
        type: 'text',
        text: String(value || '-'),
        align: 'end',
        weight: 'bold',
        color,
        size: 'sm',
        flex: 6,
        wrap: true
      }
    ]
  };
}

function salesSummaryFlex({ branchCode, submitterName, cash, credit, transfer, total }) {
  return {
    type: 'flex',
    altText: `สรุปยอดขาย สาขา ${branchCode}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: 'ยอดขาย',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg'
          },
          {
            type: 'text',
            text: `สาขา ${String(branchCode || '-')}`,
            weight: 'bold',
            color: '#CCFBF1',
            size: 'sm',
            margin: 'xs'
          }
        ]
      },
      body: {
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
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ'),
              salesAmountRow('เงินสด', cash),
              salesAmountRow('เครดิต', credit),
              salesAmountRow('โอนเงิน', transfer)
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            borderColor: '#99F6E4',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ยอดรวมทั้งหมด', color: '#047857', size: 'xs', weight: 'bold' },
              {
                type: 'text',
                text: `${Number(total || 0).toLocaleString()} บาท`,
                align: 'end',
                weight: 'bold',
                size: 'xxl',
                color: '#065F46',
                margin: 'xs'
              }
            ]
          },
          {
            type: 'text',
            text: 'ตรวจยอดให้ถูกต้อง แล้วกดส่งรูปหลักฐานเพื่อแนบรูปก่อนบันทึก',
            size: 'xs',
            color: '#64748B',
            wrap: true,
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#27AE60',
            action: {
              type: 'message',
              label: '📸 ส่งรูปหลักฐาน',
              text: 'ส่งรูปหลักฐาน'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: '✏️ แก้ไขข้อมูล',
              text: 'แก้ไข'
            }
          }
        ]
      }
    }
  };
}

function totalMismatchFlex({ cash, credit, transfer, calculatedTotal, enteredTotal }) {
  const diff = calculatedTotal - enteredTotal;
  return {
    type: 'flex',
    altText: 'ยอดรวมไม่ตรงกัน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#E53E3E',
        contents: [
          { type: 'text', text: '⚠️ ยอดรวมไม่ตรงกัน', weight: 'bold', color: '#FFFFFF', size: 'md' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: '💵 เงินสด' }, { type: 'text', text: `${Number(cash||0).toLocaleString()} บาท`, align: 'end', weight: 'bold' } ] },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: '💳 เครดิต' }, { type: 'text', text: `${Number(credit||0).toLocaleString()} บาท`, align: 'end', weight: 'bold' } ] },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: '🏦 โอน' }, { type: 'text', text: `${Number(transfer||0).toLocaleString()} บาท`, align: 'end', weight: 'bold' } ] },
          { type: 'separator', margin: 'md' },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ผลรวมที่คำนวณได้' }, { type: 'text', text: `${Number(calculatedTotal||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#27AE60' } ] },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ยอดที่กรอก' }, { type: 'text', text: `${Number(enteredTotal||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#E53E3E' } ] },
          { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ส่วนต่าง' }, { type: 'text', text: `${Number(diff||0).toLocaleString()} บาท`, align: 'end', weight: 'bold' } ] },
          { type: 'text', text: 'โปรดตรวจสอบและแก้ไขข้อมูลก่อนส่ง', size: 'xs', color: '#888888', wrap: true, margin: 'md' }
        ]
      }
    }
  };
}

function finalReviewFlex({ branchCode, submitterName, cash, credit, transfer, total, imageCount }) {
  return {
    type: 'flex',
    altText: `สรุปก่อนบันทึก สาขา ${branchCode}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1D4ED8',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: 'สรุปก่อนบันทึก', weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: 'ตรวจข้อมูลและรูปแนบก่อนส่งให้ผู้จัดการอนุมัติ', color: '#DBEAFE', size: 'xs', wrap: true, margin: 'xs' }
        ]
      },
      body: {
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
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ'),
              salesInfoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
              salesInfoRow('รูปหลักฐาน', `${imageCount || 0} รูป`, '#1D4ED8')
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'xs',
            margin: 'sm',
            contents: [
              salesAmountRow('เงินสด', cash),
              salesAmountRow('เครดิต', credit),
              salesAmountRow('โอนเงิน', transfer),
              { type: 'separator', margin: 'sm' },
              salesAmountRow('ยอดรวม', total, '#047857')
            ]
          }
        ]
      },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'button', style: 'primary', color: '#27AE60', action: { type: 'message', label: '✅ บันทึกยอดขาย', text: 'บันทึกยอดขาย' } },
        { type: 'button', style: 'secondary', action: { type: 'message', label: '✏️ แก้ไขข้อมูล', text: 'แก้ไข' } }
      ] }
    }
  };
}

function managerApprovalFlex({ saleId, branchCode, submitterName, cash, credit, transfer, total, imageCount, attachmentUrls = [] }) {
  const imageButtons = (attachmentUrls || []).slice(0, 3).map((uri, index) => ({
    type: 'button',
    style: 'link',
    action: {
      type: 'uri',
      label: `รูป ${index + 1}`,
      uri,
    },
  }));

  return {
    type: 'flex',
    altText: `ยอดขาย #${saleId} รออนุมัติ`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: `ยอดขาย #${saleId}`,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg'
          },
          {
            type: 'text',
            text: 'รอผู้จัดการตรวจและอนุมัติ',
            size: 'xs',
            color: '#CBD5E1',
            wrap: true,
            margin: 'xs'
          }
        ]
      },
      body: {
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
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ', '#0F172A'),
              salesInfoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
              salesInfoRow('รูปแนบ', `${imageCount || 0} รูป`, '#1D4ED8')
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'xs',
            margin: 'sm',
            contents: [
              salesAmountRow('เงินสด', cash),
              salesAmountRow('เครดิต', credit),
              salesAmountRow('โอนเงิน', transfer)
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#EFF6FF',
            borderColor: '#BFDBFE',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ยอดรวมที่รออนุมัติ', color: '#1D4ED8', size: 'xs', weight: 'bold' },
              {
                type: 'text',
                text: `${Number(total || 0).toLocaleString()} บาท`,
                align: 'end',
                weight: 'bold',
                color: '#1E3A8A',
                size: 'xxl',
                margin: 'xs'
              }
            ]
          }
          ,
          {
            type: 'text',
            text: 'กดอนุมัติได้เลย หรือเปิดรูปแนบเพื่อตรวจเพิ่มเติม',
            size: 'xs',
            color: '#64748B',
            wrap: true,
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...imageButtons,
          attachmentUrls.length > 3 ? {
            type: 'text',
            text: `มีรูปแนบทั้งหมด ${attachmentUrls.length} รูป`,
            size: 'xs',
            color: '#64748B',
            wrap: true,
          } : null,
          {
            type: 'button',
            style: 'primary',
            color: '#16A34A',
            action: {
              type: 'postback',
              label: 'อนุมัติ',
              data: `sales_action|${saleId}|approve`
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `sales_action|${saleId}|reject`
            }
          }
          
        ].filter(Boolean)
      }
    }
  };
}

function successFlex({ branchCode, cash, credit, transfer, total, saleId, imageCount }) {
  return {
    type: 'flex',
    altText: 'บันทึกยอดขายสำเร็จ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F766E',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '✅ บันทึกยอดขายสำเร็จ',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg',
          }
        ]
      },
      body: {
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
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              salesInfoRow('สาขา', String(branchCode || 'ไม่ระบุสาขา')),
              salesInfoRow('รหัสเอกสาร', String(saleId || '-')),
              salesAmountRow('เงินสด', cash),
              salesAmountRow('เครดิต', credit),
              salesAmountRow('โอนเงิน', transfer),
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            borderColor: '#A7F3D0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ยอดรวมทั้งหมด', color: '#047857', size: 'xs', weight: 'bold' },
              { type: 'text', text: `${Number(total || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', size: 'xl', color: '#065F46', margin: 'xs' },
            ]
          },
          {
            type: 'text',
            text: `แนบรูปแล้ว ${Number(imageCount || 0)} รูป`,
            size: 'xs',
            color: '#64748B',
            wrap: true,
            margin: 'md'
          },
          {
            type: 'text',
            text: 'ระบบบันทึกยอดขายเรียบร้อยแล้ว รอการอนุมัติจากผู้จัดการ',
            size: 'xs',
            color: '#64748B',
            wrap: true,
            margin: 'xs'
          }
        ]
      }
    }
  };
}

function approvedFlex({ saleId, branchCode, total, approvedBy, approvedAt }) {
  return resultFlex({
    title: 'อนุมัติยอดขายแล้ว',
    subtitle: `รายการ #${saleId}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: 'อนุมัติยอดขายแล้ว',
    rows: [
      uiRow('Sale ID', saleId),
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('ยอดรวม', `${Number(total || 0).toLocaleString()} บาท`, COLORS.success),
      uiRow('อนุมัติโดย', approvedBy || 'ผู้จัดการ'),
      uiRow('เวลาอนุมัติ', approvedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

function approvedSalesResultFlex({ saleId, branchCode, saleDate, total, cash, credit, transfer, approvedBy, approvedAt, attachmentUrls = [] }) {
  return resultFlex({
    title: '✅ ยอดขายได้รับการอนุมัติ',
    subtitle: `รายการ #${saleId}`,
    statusLabel: 'อนุมัติแล้ว',
    statusColor: COLORS.success,
    altText: 'อนุมัติยอดขายเรียบร้อย',
    rows: [
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('วันที่', saleDate || '-'),
      uiRow('อนุมัติโดย', approvedBy || 'ผู้จัดการ'),
      uiRow('เวลาอนุมัติ', approvedAt || 'ไม่ระบุเวลา'),
    ],
    footer: attachmentUrls && attachmentUrls.length ? {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'link', action: { type: 'uri', label: `ดูรูปแนบ (${attachmentUrls.length})`, uri: attachmentUrls[0] } },
      ],
    } : undefined,
  });
}

function salesNoticeFlex({
  title,
  subtitle,
  message,
  buttonLabel,
  buttonText,
  color = '#0F172A',
  altText,
  quickReply,
}) {
  const bubble = {
    type: 'flex',
    altText: altText || title || 'Sales notification',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title || 'แจ้งเตือนยอดขาย', color: '#FFFFFF', weight: 'bold', size: 'lg', wrap: true },
          subtitle ? { type: 'text', text: subtitle, color: '#DBEAFE', size: 'xs', margin: 'xs', wrap: true } : null,
        ].filter(Boolean),
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
            contents: [
              { type: 'text', text: message || '-', color: '#334155', size: 'sm', wrap: true },
            ],
          },
        ],
      },
    },
  };

  if (buttonLabel) {
    bubble.contents.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          action: {
            type: 'message',
            label: buttonLabel,
            text: buttonText || buttonLabel,
          },
        },
      ],
    };
  }

  if (quickReply) {
    bubble.quickReply = quickReply;
  }

  return bubble;
}

function rejectedFlex({ saleId, branchCode, rejectedBy, rejectedAt }) {
  return resultFlex({
    title: 'ตีกลับยอดขายแล้ว',
    subtitle: `รายการ #${saleId}`,
    statusLabel: 'ตีกลับ',
    statusColor: COLORS.danger,
    altText: 'ตีกลับยอดขายแล้ว',
    rows: [
      uiRow('Sale ID', saleId),
      uiRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
      uiRow('ตีกลับโดย', rejectedBy || 'ผู้จัดการ'),
      uiRow('เวลาที่ตีกลับ', rejectedAt || 'ไม่ระบุเวลา'),
    ],
  });
}

module.exports = {
  salesSummaryFlex,
  successFlex,
  totalMismatchFlex,
  finalReviewFlex,
  managerApprovalFlex,
  approvedFlex,
  approvedSalesResultFlex,
  salesNoticeFlex,
  rejectedFlex,
};
