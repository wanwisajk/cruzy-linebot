const line = require('@line/bot-sdk');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const missingLineConfig = Object.entries(lineConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingLineConfig.length > 0) {
  console.error('Missing LINE configuration:', missingLineConfig);
}

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

module.exports = {
  line,
  lineConfig,
  lineClient,
  blobClient,
  missingLineConfig,
};