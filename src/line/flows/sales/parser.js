const MONEY_PATTERN = '((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)';

function parseMoney(value) {
  const amount = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function parseSalesText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  
  const result = {
    branch_code: null,
    date: null,
    total_sales: 0,
    cash_amount: 0,
    credit_amount: 0,
    transfer_amount: 0,
    drawer_total: 0,
    raw_text: raw,
  };

  const branchMatch = raw.match(/#\s*ยอดขาย\s+([A-Za-z][A-Za-z0-9_-]{1,15})/i);
  if (branchMatch) {
    result.branch_code = branchMatch[1].toUpperCase();
  }

  // Extract date (format: dd/mm/yyyy or d/m/yyyy)
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch && !result.date) {
      const [, d, m, y] = dateMatch;
      let year = Number(y);
      if (year > 2400) year -= 543;
      else if (year < 100) year += 2500;
      if (year > 2400) year -= 543;
      result.date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      break;
    }
  }

  // Extract amounts (look for Thai keywords)
  let inDrawerSection = false;
  for (const line of lines) {
    if (/แบงค์|ลิ้นชัก|เงินทอน/i.test(line)) {
      inDrawerSection = true;
      continue;
    }

    const totalMatch = line.match(new RegExp(`^รวม(?:ยอดขาย)?\\s*[:=]?\\s*${MONEY_PATTERN}(?:\\s*บาท)?$`, 'i'));
    if (totalMatch && inDrawerSection && !result.drawer_total) {
      result.drawer_total = parseMoney(totalMatch[1]);
      continue;
    }
    if (totalMatch && !result.total_sales) {
      result.total_sales = parseMoney(totalMatch[1]);
    }

    const cashMatch = line.match(new RegExp(`เงินสด\\s*[:=]?\\s*${MONEY_PATTERN}`, 'i'));
    if (cashMatch && !result.cash_amount) {
      result.cash_amount = parseMoney(cashMatch[1]);
    }

    const creditMatch = line.match(new RegExp(`บัตร(?:เครดิต)?\\s*[:=]?\\s*${MONEY_PATTERN}`, 'i'));
    if (creditMatch && !result.credit_amount) {
      result.credit_amount = parseMoney(creditMatch[1]);
    }

    const transferMatch = line.match(new RegExp(`โอน(?:เงิน)?\\s*[:=]?\\s*${MONEY_PATTERN}`, 'i'));
    if (transferMatch && !result.transfer_amount) {
      result.transfer_amount = parseMoney(transferMatch[1]);
    }
  }

  return result;
}

module.exports = { parseSalesText };
