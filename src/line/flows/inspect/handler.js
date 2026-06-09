const { parseInspect } = require('./parser');
const inspectFlex = require('../../flex/inspectFlex');
const { replyOrPush } = require('../../reply');

async function handle(event) {
  const parsed = parseInspect(event);
  const ok = parsed.items.length === 0;
  const flex = inspectFlex({ items: parsed.items, ok });
  await replyOrPush({ replyToken: event.replyToken, messages: [flex] });
}

module.exports = { handle };
