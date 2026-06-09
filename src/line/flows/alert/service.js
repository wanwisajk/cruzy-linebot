const alertFlex = require('../../flex/alertFlex');
const { replyOrPush } = require('../../reply');

async function sendAlert(to, title, body) {
  const flex = alertFlex({ title, body });
  await replyOrPush({ to, messages: [flex] });
}

module.exports = { sendAlert };
