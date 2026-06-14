const { parseDateFromText } = require('../../utils/attendance');

function parseDepositText(text, fallbackDate) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wholeText = lines.join(' ');
  const result = { amount: 0, bank: null, bankShort: null, branchCode: null, depositDate: parseDateFromText(text, fallbackDate), diff: 0 };

  // amount: find first number-like token (supports commas)
  const amountMatch = wholeText.match(/(\d[\d,]*)/);
  if (amountMatch) result.amount = Number(amountMatch[1].replace(/,/g, ''));

  // bank explicit forms: "bank_short: KBank1" or "ธนาคาร: KBank1"
  for (const line of lines) {
    const b = line.match(/ธนาคาร\s*[:=]\s*(.+)/i);
    if (b && !result.bank) result.bank = b[1].trim();

    const shortMatch = line.match(/(?:bank_short|bank|ธน)\s*[:=]\s*([A-Za-z0-9_\-]{2,20})/i);
    if (shortMatch && !result.bankShort) result.bankShort = shortMatch[1].toUpperCase();
  }

  // If not found explicitly, try to pick the first token after the amount as bank short
  if (!result.bankShort && amountMatch) {
    const afterAmount = wholeText.slice(wholeText.indexOf(amountMatch[0]) + amountMatch[0].length).trim();
    if (afterAmount) {
      // take first token (split by whitespace or punctuation)
      const token = afterAmount.split(/[\s,;:\|\(\)]+/)[0];
      if (token && /^[A-Za-z0-9_\-]{2,20}$/.test(token) && !/^[0-9]+$/.test(token)) {
        result.bankShort = token.toUpperCase();
      }
    }
  }

  // branch code (still try to detect uppercase short codes like CCA)
  const branchMatch = wholeText.match(/\b([A-Z]{2,6})\b/);
  if (branchMatch) {
    // if bankShort equals the same token, prefer it for bankShort and skip branch
    const token = branchMatch[1].toUpperCase();
    if (!result.bankShort || token !== (result.bankShort || '').toUpperCase()) {
      result.branchCode = token;
    }
  }

  return result;
}

module.exports = { parseDepositText };
