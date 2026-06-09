const depositFlex = require('../../flex/depositFlex');
const { replyOrPush } = require('../../reply');
const { parseDepositText } = require('./parser');
const { recordDeposit } = require('./service');
const { logEvent } = require('../../utils/audit');

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const parsed = parseDepositText(text);

  // record deposit into DB
  const source = event.source || {};
  const actor = source.userId || null;

  const created = await recordDeposit({
    deposited_by: actor,
    deposited_amount: parsed.amount || 0,
    bank: parsed.bank || null,
    slip_url: null,
  });

  await logEvent('deposit_recorded', { deposit: created, actor });

  const flex = depositFlex({ amount: parsed.amount, bank: parsed.bank, diff: parsed.diff });
  await replyOrPush({ replyToken: event.replyToken, messages: [flex] });
}

module.exports = { handle };
