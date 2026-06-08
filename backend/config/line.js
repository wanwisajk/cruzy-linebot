const line = require('@line/bot-sdk');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const missingLineConfig = Object.entries(lineConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken || 'missing-token',
});

module.exports = {
  line,
  lineConfig,
  lineClient,
  missingLineConfig,
};
