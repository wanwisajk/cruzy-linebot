const { parseDateFromText } = require('../../utils/attendance');

function parseDepositText(text, fallbackDate) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = { amount: 0, bank: null, bankShort: null, branchCode: null, depositDate: parseDateFromText(text, fallbackDate), diff: 0 };
  const wholeText = lines.join(' ');

  const branchMatch = wholeText.match(/\b([A-Z]{2,5})\b/i);
  if (branchMatch) result.branchCode = branchMatch[1].toUpperCase();

  const amountMatch = wholeText.match(/(?:ฝาก|ยอดฝาก|amount)?\s*[:=]?\s*([\d,]{3,})/i);
  if (amountMatch) result.amount = Number(amountMatch[1].replace(/,/g, ''));

  for (const line of lines) {
    const b = line.match(/ธนาคาร\s*[:=]\s*(.+)/i);
    if (b) result.bank = b[1].trim();

    const shortMatch = line.match(/(?:bank_short|bank|ธน)\s*[:=]\s*([A-Z0-9]{2,10})/i);
    if (shortMatch) result.bankShort = shortMatch[1].toUpperCase();
  }

  if (!result.bankShort) {
    const inlineShort = wholeText.match(/\b([A-Z]{2,10})\b/);
    if (inlineShort && !result.branchCode) {
      result.bankShort = inlineShort[1].toUpperCase();
    }
  }

  return result;
}

module.exports = { parseDepositText };
