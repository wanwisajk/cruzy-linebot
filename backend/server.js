require('dotenv').config();

const express = require('express');
const cors = require('cors');
const lineWebhookRoutes = require('./routes/line.webhook');

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cruzy-linebot',
    modules: ['line-messaging-api', 'qa'],
  });
});

app.use('/webhook', lineWebhookRoutes);

app.use(cors());
app.use(express.json());

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(port, () => {
  console.log(`Cruzy LINE bot listening on port ${port}`);
});
