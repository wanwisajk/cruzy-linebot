const { lineClient } = require('../../backend/config/line');

async function replyOrPush({ replyToken, to, messages }) {
  if (replyToken) {
    return lineClient.replyMessage({ replyToken, messages });
  }

  if (to) {
    return lineClient.pushMessage({ to, messages });
  }

  throw new Error('No replyToken or target provided for replyOrPush');
}

module.exports = {
  replyOrPush,
};
