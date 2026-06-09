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
    raw_text: raw,
  };

  // Extract branch code from first line like "#ยอดขาย onm"
  const firstLine = lines[0] || '';
  const branchMatch = firstLine.match(/#ยอดขาย\s+(\S+)/i);
  if (branchMatch) {
    result.branch_code = branchMatch[1].toUpperCase();
  }

  // Extract date (format: dd/mm/yyyy or d/m/yyyy)
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch && !result.date) {
      const [, d, m, y] = dateMatch;
      result.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      break;
    }
  }

  // Extract amounts (look for Thai keywords)
  for (const line of lines) {
    const totalMatch = line.match(/รวมยอดขาย\s*[:=]?\s*([\d,]+)/i);
    if (totalMatch && !result.total_sales) {
      result.total_sales = Number(totalMatch[1].replace(/,/g, ''));
    }

    const cashMatch = line.match(/เงินสด\s*[:=]?\s*([\d,]+)/i);
    if (cashMatch && !result.cash_amount) {
      result.cash_amount = Number(cashMatch[1].replace(/,/g, ''));
    }

    const creditMatch = line.match(/บัตร(?:เครดิต)?\s*[:=]?\s*([\d,]+)/i);
    if (creditMatch && !result.credit_amount) {
      result.credit_amount = Number(creditMatch[1].replace(/,/g, ''));
    }

    const transferMatch = line.match(/โอน(?:เงิน)?\s*[:=]?\s*([\d,]+)/i);
    if (transferMatch && !result.transfer_amount) {
      result.transfer_amount = Number(transferMatch[1].replace(/,/g, ''));
    }
  }

  return result;
}

module.exports = { parseSalesText };
