function parseSalesReport(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const report = {
    date: null,
    totalAmount: null,
    cashAmount: null,
    creditAmount: null,
    transferAmount: null,
    drawer: [],
    drawerRawText: '',
    rawText: text,
  };

  const drawerLines = [];
  let isInDrawerSection = false;

  for (const line of lines) {
    const normalized = line.toLowerCase();

    if (normalized.includes('แบงค์') || normalized.includes('drawer')) {
      isInDrawerSection = true;
      continue;
    }

    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch && !report.date) {
      const [, d, m, y] = dateMatch;
      let year = parseInt(y, 10);
      if (year < 100) {
        year += 2500;
      }
      const month = String(parseInt(m, 10)).padStart(2, '0');
      const day = String(parseInt(d, 10)).padStart(2, '0');
      report.date = `${year}-${month}-${day}`;
      isInDrawerSection = false;
      continue;
    }

    const totalSalesMatch = line.match(/รวมยอดขาย\s*[:\-]?\s*([\d,]+)/i);
    if (totalSalesMatch && !report.totalAmount) {
      report.totalAmount = Number(totalSalesMatch[1].replace(/,/g, ''));
      isInDrawerSection = false;
      continue;
    }

    const amountMatch = line.match(/(?:รวม|total)\s*[:\-]?\s*([\d,]+)/i);
    if (amountMatch && !report.totalAmount && !isInDrawerSection) {
      report.totalAmount = Number(amountMatch[1].replace(/,/g, ''));
      continue;
    }

    const cashMatch = line.match(/เงินสด\s*[:\-]?\s*([\d,]+)/i);
    if (cashMatch && !report.cashAmount) {
      report.cashAmount = Number(cashMatch[1].replace(/,/g, ''));
      isInDrawerSection = false;
      continue;
    }

    const creditMatch = line.match(/บัตรเครดิต\s*[:\-]?\s*([\d,]+)/i);
    if (creditMatch && !report.creditAmount) {
      report.creditAmount = Number(creditMatch[1].replace(/,/g, ''));
      isInDrawerSection = false;
      continue;
    }

    const transferMatch = line.match(/โอน(?:เงิน)?\s*[:\-]?\s*([\d,]+)/i);
    if (transferMatch && !report.transferAmount) {
      report.transferAmount = Number(transferMatch[1].replace(/,/g, ''));
      isInDrawerSection = false;
      continue;
    }

    const drawerMatch = line.match(/^(\d+)\s*[-:\u2013\u2014\s]\s*([\d,]+)/);
    if (drawerMatch) {
      report.drawer.push({
        denomination: Number(drawerMatch[1]),
        amount: Number(drawerMatch[2].replace(/,/g, '')),
      });
      if (isInDrawerSection) {
        drawerLines.push(line);
      }
      continue;
    }
  }

  report.drawerRawText = drawerLines.join('\n');
  return report;
}

function extractBranchCode(text) {
  const raw = String(text || '');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^รวมยอดขาย/i.test(line)) {
      continue;
    }

    const match = line.match(/^(?:สาขา|branch|ยอดขาย)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9]*)\b/i);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

module.exports = {
  parseSalesReport,
  extractBranchCode,
};
