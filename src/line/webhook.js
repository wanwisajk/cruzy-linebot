const express = require('express');
const router = express.Router();
const { line, lineConfig } = require('../../backend/config/line');
const { handleEvent } = require('./router');
const { runLineJobs } = require('./services/lineJobs');

// LINE signature verification middleware
function verifyLineSignature(req, res, next) {
  const signature = req.get('X-Line-Signature');
  if (!signature) {
    console.warn('Missing X-Line-Signature header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.rawBody || JSON.stringify(req.body || {});
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha256', lineConfig.channelSecret)
    .update(body)
    .digest('base64');

  if (signature !== hash) {
    console.warn('Invalid signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

router.post('/', async (req, res, next) => {
  // TODO: Enable signature verification in production
  // verifyLineSignature(req, res, async () => {
  try {
    const requestBody = req.body || {};
    if (!requestBody.events) {
      console.warn('⚠️ LINE webhook missing body events', {
        contentType: req.get('content-type'),
        bodyKeys: Object.keys(requestBody),
      });
      return res.status(400).json({ error: 'Missing webhook events' });
    }

    const events = requestBody.events || [];
    console.log(`📨 Received ${events.length} event(s)`);
    const results = await Promise.allSettled(events.map((ev) => 
      handleEvent(ev).catch((err) => {
        console.error('❌ Error handling event:', err.message || err);
        return null;
      })
    ));
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    runLineJobs().catch((err) => console.warn('LINE jobs skipped:', err.message || err));
    console.log(`✅ Processed: ${succeeded} OK, ${failed} failed`);
    
    res.json({ ok: true, processed: succeeded });
  } catch (err) {
    console.error('🔴 Webhook error:', err.message || err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
  // });
});

module.exports = router;
