const express = require('express');
const { lineMiddleware } = require('../middleware/line.middleware');
const { handleLineEvent } = require('../handlers/lineMessage.handler');

const router = express.Router();

router.post('/', lineMiddleware, async (req, res, next) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleLineEvent));
    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
