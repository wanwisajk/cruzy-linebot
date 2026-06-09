# Cruzy LINE Bot

Backend first phase for Cruzy LINE Messaging API Q&A.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill LINE Messaging API and Supabase values.
3. Start the server.

```bash
npm install
npm start
```

## Webhook

Set LINE Messaging API webhook URL to:

```txt
https://your-domain.com/webhook
```

## Current Bot Commands

- `เมนู`
- `โปรไฟล์`
- `ตารางวันนี้`
- `ตารางพรุ่งนี้`
- `ตารางงาน`
- `สาขา`
- `พนักงาน {ชื่อ}`

LIFF and dashboard are intentionally not included in this phase.
