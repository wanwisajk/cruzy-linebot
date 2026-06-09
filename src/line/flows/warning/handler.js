const warningFlex = require('../../flex/warningFlex');
const { replyOrPush } = require('../../reply');

async function handle(event) {
  const flex = warningFlex({ level: 'ตักเตือนด้วยวาจา', note: 'รายละเอียด...' });
  await replyOrPush({ replyToken: event.replyToken, messages: [flex] });
}

module.exports = { handle };
