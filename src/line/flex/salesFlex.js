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
            text: 'รายงานยอดขายประจำวัน',
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
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ'),
              salesInfoRow('สาขา', branchCode || 'ไม่ระบุสาขา')
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'sm',
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
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ'),
              salesInfoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
              salesInfoRow('รูปหลักฐาน', `${imageCount || 0} รูป`, '#1D4ED8')
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'sm',
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

function managerApprovalFlex({ saleId, branchCode, submitterName, cash, credit, transfer, total, imageCount }) {
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
              salesInfoRow('ผู้ส่งยอดขาย', submitterName || 'ไม่ระบุ', '#0F172A'),
              salesInfoRow('สาขา', branchCode || 'ไม่ระบุสาขา'),
              salesInfoRow('รูปแนบ', `${imageCount || 0} รูป`, '#1D4ED8')
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            cornerRadius: 'md',
            paddingAll: 'md',
            spacing: 'sm',
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
            color: '#16A34A',
            action: {
              type: 'postback',
              label: '✅ อนุมัติ',
              data: `sales_action|${saleId}|approve`
            }
          }
          
        ]
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
        backgroundColor: '#27AE60',
        contents: [
          {
            type: 'text',
            text: '🎉 บันทึกยอดขายสำเร็จ',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg',
            align: 'center'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🏢 สาขา', color: '#666666', size: 'sm' },
              { type: 'text', text: String(branchCode || 'ไม่ระบุสาขา'), align: 'end', weight: 'bold', color: '#333333', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💰 ยอดรวม', color: '#666666', size: 'sm' },
              { type: 'text', text: `${Number(total||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#27AE60', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🆔 รหัสเอกสาร', color: '#666666', size: 'sm' },
              { type: 'text', text: String(saleId), align: 'end', weight: 'bold', color: '#333333', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📸 รูปภาพแนบ', color: '#666666', size: 'sm' },
              { type: 'text', text: `${imageCount} รูป`, align: 'end', weight: 'bold', color: '#333333', size: 'sm' }
            ]
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานะ', color: '#6B7280', size: 'xs' },
              { type: 'text', text: 'Draft', align: 'end', weight: 'bold', color: '#1D4ED8', size: 'xs' }
            ]
          },
          { type: 'text', text: 'ระบบบันทึกยอดขายเรียบร้อยแล้ว รอการอนุมัติจากผู้จัดการ', size: 'xs', color: '#888888', wrap: true, align: 'center', margin: 'md' }
        ]
      }
    }
  };
}

function approvedFlex({ saleId, branchCode, total, approvedBy, approvedAt }) {
  return {
    type: 'flex',
    altText: 'อนุมัติยอดขายแล้ว',
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
            text: '✅ อนุมัติยอดขายแล้ว',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg',
            align: 'center'
          },
          {
            type: 'text',
            text: 'รายการนี้ได้รับการอนุมัติเรียบร้อยแล้ว',
            size: 'xs',
            color: '#CCFBF1',
            align: 'center',
            wrap: true,
            margin: 'md'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            cornerRadius: 'md',
            borderWidth: '1px',
            borderColor: '#D1FAE5',
            paddingAll: 'lg',
            backgroundColor: '#ECFDF5',
            contents: [
              {
                type: 'text',
                text: 'ข้อมูลยอดขาย',
                weight: 'bold',
                color: '#065F46',
                size: 'md'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '🆔 Sale ID', color: '#065F46', size: 'sm' },
                      { type: 'text', text: String(saleId), align: 'end', weight: 'bold', color: '#134E4A', size: 'sm' }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '🏢 สาขา', color: '#065F46', size: 'sm' },
                      { type: 'text', text: String(branchCode || 'ไม่ระบุสาขา'), align: 'end', weight: 'bold', color: '#134E4A', size: 'sm' }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '💰 ยอดรวม', color: '#065F46', size: 'sm' },
                      { type: 'text', text: `${Number(total||0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#134E4A', size: 'sm' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            cornerRadius: 'md',
            borderWidth: '1px',
            borderColor: '#D1FAE5',
            paddingAll: 'lg',
            backgroundColor: '#F0FDF4',
            contents: [
              {
                type: 'text',
                text: 'รายละเอียดการอนุมัติ',
                weight: 'bold',
                color: '#065F46',
                size: 'md'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '👤 อนุมัติโดย', color: '#065F46', size: 'sm' },
                      { type: 'text', text: String(approvedBy || 'ผู้จัดการ'), align: 'end', weight: 'bold', color: '#134E4A', size: 'sm' }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '📅 วันที่อนุมัติ', color: '#065F46', size: 'sm' },
                      { type: 'text', text: String(approvedAt || 'ไม่ระบุเวลา'), align: 'end', weight: 'bold', color: '#134E4A', size: 'sm' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'สถานะ',
                color: '#6B7280',
                size: 'xs'
              },
              {
                type: 'text',
                text: 'ยืนยันแล้ว',
                align: 'end',
                weight: 'bold',
                color: '#16A34A',
                size: 'xs'
              }
            ]
          }
        ]
      }
    }
  };
}

function rejectedFlex({ saleId, branchCode, rejectedBy, rejectedAt }) {
  return {
    type: 'flex',
    altText: 'ตีกลับยอดขายแล้ว',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#DC2626',
        contents: [
          {
            type: 'text',
            text: '❌ ตีกลับยอดขายแล้ว',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'lg',
            align: 'center'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🆔 Sale ID', color: '#666666', size: 'sm' },
              { type: 'text', text: String(saleId), align: 'end', weight: 'bold', color: '#111111', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🏢 สาขา', color: '#666666', size: 'sm' },
              { type: 'text', text: String(branchCode || 'ไม่ระบุสาขา'), align: 'end', weight: 'bold', color: '#111111', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '👤 ตีกลับโดย', color: '#666666', size: 'sm' },
              { type: 'text', text: String(rejectedBy || 'ผู้จัดการ'), align: 'end', weight: 'bold', color: '#111111', size: 'sm' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📅 เวลาที่ตีกลับ', color: '#666666', size: 'sm' },
              { type: 'text', text: String(rejectedAt || 'ไม่ระบุเวลา'), align: 'end', weight: 'bold', color: '#111111', size: 'sm' }
            ]
          }
        ]
      }
    }
  };
}

module.exports = {
  salesSummaryFlex,
  successFlex,
  totalMismatchFlex,
  finalReviewFlex,
  managerApprovalFlex,
  approvedFlex,
  rejectedFlex,
};
