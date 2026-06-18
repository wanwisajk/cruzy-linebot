const { lineClient } = require('../../backend/config/line');

function getLineErrorDetail(error) {
  const detail = {
    message: error && error.message,
    statusCode: error && (error.statusCode || error.status),
  };

  const responseData =
    error && error.response && error.response.data ||
    error && error.originalError && error.originalError.response && error.originalError.response.data ||
    error && error.body;

  if (responseData) detail.response = responseData;
  if (error && error.details) detail.details = error.details;

  return detail;
}

async function replyOrPush({ replyToken, to, messages }) {
  try {
    if (replyToken) {
      return await lineClient.replyMessage({ replyToken, messages });
    }

    if (to) {
      return await lineClient.pushMessage({ to, messages });
    }
  } catch (error) {
    console.error('LINE send failed:', getLineErrorDetail(error));
    throw error;
  }

  throw new Error('No replyToken or target provided for replyOrPush');
}

module.exports = {
  replyOrPush,
};
