const { lineClient } = require('../config/line');
const { answerQuestion } = require('../services/qa.service');

async function handleLineEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const response = await answerQuestion({
    text: event.message.text,
    source: event.source || {},
  });

  return lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: [response],
  });
}

module.exports = {
  handleLineEvent,
};
