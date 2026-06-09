function parseDepositText(text) {
  // Very simple heuristics: lines like "ยอดฝาก = 1000" and "ธนาคาร: KBank"
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = { amount: 0, bank: null, diff: 0 };
  for (const line of lines) {
    const m = line.match(/ยอด|amount|ยอดฝาก\s*[:=]\s*([\d,]+)/i);
    if (m) result.amount = Number(m[1].replace(/,/g, ''));
    const b = line.match(/ธนาคาร\s*[:=]\s*(.+)/i);
    if (b) result.bank = b[1].trim();
  }
  // diff calculation would require comparing expected cash; leave as 0 for now
  return result;
}

module.exports = { parseDepositText };
