require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

// Error handlers (ต้องจำไว้ก่อน require routes)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

const srcLineWebhook = require('../src/line/webhook');
const { runLineJobs } = require('../src/line/services/lineJobs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cruzy-linebot',
  });
});

// Main webhook routes
app.use('/webhook', srcLineWebhook);
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('🔴 Express Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const server = app.listen(port, () => {
  console.log(`✅ Cruzy LINE bot listening on port ${port}`);
});

const lineJobInterval = setInterval(() => {
  runLineJobs().catch((err) => console.warn('LINE jobs skipped:', err.message || err));
}, 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  clearInterval(lineJobInterval);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
