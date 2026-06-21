const { parseDateFromText } = require('../../utils/attendance');

function parseDepositText(text, fallbackDate) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wholeText = lines.join(' ');
  const result = {
    amount: 0,
    expectedAmount: 0,
    varianceAmount: 0,
    bank: null,
    bankShort: null,
    branchCode: null,
    depositDate: parseDateFromText(text, fallbackDate),
    diff: 0,
  };

  const labeledDeposit = findLineAmount(lines, /ยอด\s*ฝาก|ฝาก\s*จริง|deposited|deposit/i);
  const amountMatch = labeledDeposit || findDepositAmount(wholeText);
  if (amountMatch) result.amount = parseMoney(amountMatch.value);

  result.expectedAmount = result.amount;
  result.varianceAmount = result.expectedAmount - result.amount;
  result.diff = result.varianceAmount;

  // bank explicit forms: "bank_short: KBank1" or "ธนาคาร: KBank1"
  for (const line of lines) {
    const b = line.match(/ธนาคาร\s*[:=]\s*(.+)/i);
    if (b && !result.bank) result.bank = b[1].trim();

    const shortMatch = line.match(/(?:bank_short|bank|ธน)\s*[:=]\s*([A-Za-z0-9_\-]{2,20})/i);
    if (shortMatch && !result.bankShort) result.bankShort = shortMatch[1].toUpperCase();
  }

  // If not found explicitly, try to pick the first token after the amount as bank short
  if (!result.bankShort && amountMatch) {
    const afterAmount = wholeText.slice(amountMatch.index + amountMatch.value.length).trim();
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

function findLineAmount(lines, labelPattern) {
  const amountPattern = '(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)';
  const flags = labelPattern.ignoreCase ? 'i' : '';
  const pattern = new RegExp(`(?:${labelPattern.source})\\s*[:=]?\\s*${amountPattern}`, flags);

  for (const line of lines) {
    const match = String(line || '').match(pattern);
    if (match && match[1]) return { value: match[1], index: match.index || 0, line };
  }
  return null;
}

function findDepositAmount(text) {
  const normalized = String(text || '');
  const dateLikePattern = /\d{1,4}[\/\-.]\d{1,2}(?:[\/\-.]\d{1,4})?/g;
  const dateRanges = [];
  let dateMatch;

  while ((dateMatch = dateLikePattern.exec(normalized)) !== null) {
    dateRanges.push([dateMatch.index, dateMatch.index + dateMatch[0].length]);
  }

  const numberPattern = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g;
  const candidates = [];
  let match;

  while ((match = numberPattern.exec(normalized)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const insideDate = dateRanges.some(([dateStart, dateEnd]) => start >= dateStart && end <= dateEnd);
    if (insideDate) continue;

    const value = parseMoney(match[0]);
    if (!Number.isFinite(value) || value <= 0) continue;
    candidates.push({ value: match[0], amount: value, index: start });
  }

  if (candidates.length === 0) return null;

  const labeled = candidates.find((candidate) => {
    const before = normalized.slice(Math.max(0, candidate.index - 20), candidate.index);
    return /ยอด|ฝาก|จำนวน|amount/i.test(before);
  });

  return labeled || candidates[candidates.length - 1];
}

function parseMoney(value) {
  const amount = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

module.exports = { parseDepositText };
