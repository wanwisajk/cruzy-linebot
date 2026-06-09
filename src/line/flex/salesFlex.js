function salesSummaryFlex({ branchCode, cash, credit, transfer, total }) {
  return {
    type: 'flex',
    altText: `สรุปยอดขาย สาขา ${branchCode}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1E3A8A',
        contents: [
          {
            type: 'text',
            text: '📋 รายงานยอดขายประจำวัน',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md'
          },
          {
            type: 'text',
            text: `สาขา: ${branchCode}`,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'xl',
            margin: 'sm'
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
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💵 เงินสด', color: '#555555' },
              { type: 'text', text: `${Number(cash || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#333333' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💳 เครดิต', color: '#555555' },
              { type: 'text', text: `${Number(credit || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#333333' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🏦 โอนเงิน', color: '#555555' },
              { type: 'text', text: `${Number(transfer || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', color: '#333333' }
            ]
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              { type: 'text', text: '💰 ยอดรวมทั้งสิ้น', weight: 'bold', size: 'md', color: '#111111' },
              { type: 'text', text: `${Number(total || 0).toLocaleString()} บาท`, align: 'end', weight: 'bold', size: 'lg', color: '#27AE60' }
            ]
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'text',
            text: '💡 กรุณาส่งรูปภาพหลักฐานยอดขาย จากนั้นกดปุ่ม "ยืนยัน"',
            size: 'xs',
            color: '#888888',
            style: 'italic',
            wrap: true,
            margin: 'md'
          }
        ]
      }
    }
  };
}

function imageReceivedFlex(branchCode, imageCount) {
  return {
    type: 'flex',
    altText: `อัปโหลดรูปภาพแล้ว (${imageCount} รูป)`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '📸 ได้รับรูปภาพหลักฐานแล้ว',
            weight: 'bold',
            size: 'lg',
            color: '#1E3A8A'
          },
          {
            type: 'text',
            text: `สาขา: ${branchCode}`,
            size: 'sm',
            color: '#666666'
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F3F4F6',
            paddingAll: 'lg',
            cornerRadius: 'md',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: `จำนวนที่ได้รับในระบบ`,
                align: 'center',
                color: '#666666',
                size: 'xs'
              },
              {
                type: 'text',
                text: `${imageCount} รูป`,
                size: 'xxl',
                weight: 'bold',
                align: 'center',
                color: '#27AE60',
                margin: 'xs'
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#27AE60',
            action: {
              type: 'message',
              label: '✅ ยืนยันส่งยอดขาย',
              text: `ยืนยัน ${branchCode}`
            }
          }
        ]
      }
    }
  };
}

function successFlex({ branchCode, saleId, imageCount }) {
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
              { type: 'text', text: branchCode, align: 'end', weight: 'bold', color: '#333333', size: 'sm' }
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
            type: 'text',
            text: '⏳ ระบบส่งข้อมูลให้ผู้จัดการตรวจรับและอนุมัติแล้ว',
            size: 'xs',
            color: '#E67E22',
            weight: 'bold',
            align: 'center',
            margin: 'md'
          }
        ]
      }
    }
  };
}

module.exports = {
  salesSummaryFlex,
  imageReceivedFlex,
  successFlex
};