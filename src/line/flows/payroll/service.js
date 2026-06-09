const payrollFlex = require('../../flex/payrollFlex');
const { replyOrPush } = require('../../reply');

async function sendPayroll(to, data) {
  const flex = payrollFlex({ gross: data.gross, deductions: data.deductions, net: data.net });
  await replyOrPush({ to, messages: [flex] });
}

module.exports = { sendPayroll };
