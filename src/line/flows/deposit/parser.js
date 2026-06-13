const { parseDateFromText } = require('../../utils/attendance');

function parseDepositText(text, fallbackDate) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = { amount: 0, bank: null, branchCode: null, depositDate: parseDateFromText(text, fallbackDate), diff: 0 };
  const wholeText = lines.join(' ');

  const branchMatch = wholeText.match(/\b([A-Z]{2,5})\b/i);
  if (branchMatch) result.branchCode = branchMatch[1].toUpperCase();

  const amountMatch = wholeText.match(/(?:ฝาก|ยอดฝาก|amount)?\s*[:=]?\s*([\d,]{3,})/i);
  if (amountMatch) result.amount = Number(amountMatch[1].replace(/,/g, ''));

  for (const line of lines) {
    const b = line.match(/ธนาคาร\s*[:=]\s*(.+)/i);
    if (b) result.bank = b[1].trim();
  }

  return result;
}

module.exports = { parseDepositText };
