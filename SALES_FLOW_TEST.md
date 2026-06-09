# Sales Flow Test Guide

## ขั้นตอนการทดสอบ Sales Flow

### Step 1: Send Sales Text Message

**Webhook POST: `/v2/webhook`**

```json
{
  "events": [
    {
      "type": "message",
      "message": {
        "type": "text",
        "id": "100001",
        "text": "#ยอดขาย onm\nแบงค์ในลิ้นชัก\n500-1000\n100-900\n20-320\n10-40\n5-70\nรวม 2330 บาท\n\n12/06/2026\nรวมยอดขาย 14440\nเงินสด 6190\nบัตรเครดิต 3520\nโอนเงิน 4730"
      },
      "replyToken": "nHuyWiB7yP5Zw52FIkcQT",
      "source": {
        "type": "user",
        "userId": "U0011112222333344445555666666"
      }
    }
  ]
}
```

**Expected Response:**
- System parses:
  - branch_code: `ONM`
  - date: `2026-06-12`
  - total_sales: `14440`
  - cash_amount: `6190`
  - credit_amount: `3520`
  - transfer_amount: `4730`
  - raw_text: (บันทึกทั้งหมด)
- Sales record created with status = `draft`
- Flow state set to `AWAITING_IMAGES`
- LINE reply: "บันทึกยอดขาย ONM เรียบร้อย\n\nกรุณาส่งรูปยอดขาย 3-4 รูป"

### Step 2: Send Image Message (3-4 images)

**Webhook POST: `/v2/webhook`**

```json
{
  "events": [
    {
      "type": "message",
      "message": {
        "type": "image",
        "id": "100002"
      },
      "replyToken": "nHuyWiB7yP5Zw52FIkcQT",
      "source": {
        "type": "user",
        "userId": "U0011112222333344445555666666"
      }
    }
  ]
}
```

**Expected Response (after image 1-2):**
- LINE reply: "ได้รับรูป N รูป กรุณาส่งเพิ่มอีก M รูป"

**Expected Response (after image 3+):**
- Flow state set to `IMAGES_COMPLETE`
- LINE Flex Message with summary:
  - สรุปยอดขาย ONM
  - วันที่: 2026-06-12
  - เงินสด: 6,190 บาท
  - บัตรเครดิต: 3,520 บาท
  - โอนเงิน: 4,730 บาท
  - รวมทั้งหมด: 14,440 บาท
  - รูป: 3 รูป
  - Buttons: [ยืนยัน] [แก้ไข]

### Step 3: Click "ยืนยัน" Button

**Webhook POST: `/v2/webhook`**

```json
{
  "events": [
    {
      "type": "postback",
      "postback": {
        "data": "sales_confirm|<SALE_ID>"
      },
      "replyToken": "nHuyWiB7yP5Zw52FIkcQT",
      "source": {
        "type": "user",
        "userId": "U0011112222333344445555666666"
      }
    }
  ]
}
```

**Expected Response:**
- Audit log entry: `sales_confirmed_by_submitter`
- LINE reply: "ยืนยันยอดขายเรียบร้อย ID: <SALE_ID>\n\nรอการอนุมัติจากผู้จัดการ"

### Step 4: Click "แก้ไข" Button (Alternative)

**Webhook POST: `/v2/webhook`**

```json
{
  "events": [
    {
      "type": "postback",
      "postback": {
        "data": "sales_edit|<SALE_ID>"
      },
      "replyToken": "nHuyWiB7yP5Zw52FIkcQT",
      "source": {
        "type": "user",
        "userId": "U0011112222333344445555666666"
      }
    }
  ]
}
```

**Expected Response:**
- Audit log entry: `sales_edit_requested`
- LINE reply: "ขอแก้ไขยอดขาย ID: <SALE_ID>\n\nกรุณาส่งข้อมูลใหม่"

## Integration Notes

- **Branch Code Detection**: Parser looks for `#ยอดขาย <CODE>` format
- **Date Extraction**: Supports `dd/mm/yyyy` and `d/m/yyyy` formats
- **Amount Parsing**: Supports both space and colon separators
- **State Management**: In-memory Map tracks per userId (1 active flow per user)
- **Image Validation**: Requires 3+ images for auto-summary
- **Error Handling**: Missing branch code → error reply with example format

## Database Schema Expected

```sql
-- sales table (existing)
sell_date, branch_id, cash_amount, credit_amount, transfer_amount, total_amount, raw_text, status, submitted_by, submitted_at

-- system_audit_logs table (existing)
event_type, payload, created_at
```

## Postback Flow Diagram

```
Text Message (#ยอดขาย)
    ↓
Parse + Create Draft Sale
    ↓
Set State: AWAITING_IMAGES
    ↓
(1-2 images) → Ask for more
    ↓
(3+ images) → Show Summary Flex with Buttons
    ↓
[ยืนยัน] or [แก้ไข]
    ↓
Set Audit Log + Reply
    ↓
Ready for Manager Approval
```
