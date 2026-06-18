const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const { uploadAttachmentBuffer } = require('../../../../backend/services/attachment.service');
const { createWorker, PSM } = require('tesseract.js');
const os = require('os');
const path = require('path');

let tesseractWorkerPromise = null;

async function resolveBankAccountId(bank, bankShort) {
  const candidates = [bankShort, bank].filter(Boolean);
  if (candidates.length === 0) return null;

  for (const value of candidates) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id,bank_name,bank_short')
      .or(`bank_short.eq.${String(value)},bank_name.ilike.${String(value)}`)
      .maybeSingle();

    if (error) {
      console.warn('Unable to resolve bank account:', error.message || error, { bank, bankShort });
      continue;
    }

    if (data && data.id) return data.id;
  }

  return null;
}

async function resolveBankAccount(bank, bankShort) {
  const candidates = [bankShort, bank].filter(Boolean);
  if (candidates.length === 0) return null;

  for (const value of candidates) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id,bank_name,bank_short,account_name,account_no')
      .or(`bank_short.eq.${String(value)},bank_name.ilike.${String(value)}`)
      .maybeSingle();

    if (error) {
      console.warn('Unable to resolve bank account:', error.message || error, { bank, bankShort });
      continue;
    }

    if (data && data.id) return data;
  }

  return null;
}

async function resolveBranchBankAccount(branchId) {
  if (!branchId) return null;

  const { data, error } = await supabase
    .from('bank_account_branches')
    .select('bank_accounts(id,bank_name,bank_short,account_name,account_no)')
    .eq('branch_id', branchId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('Unable to resolve branch bank account:', error.message || error, { branchId });
    return null;
  }

  return data && data.bank_accounts ? data.bank_accounts : null;
}

async function getLineMessageContentBuffer(messageId) {
  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function uploadSlipImageFromBuffer(messageId, buffer) {
  const fileName = `deposit_${messageId}.jpg`;
  const storagePath = `deposit/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from('documents')
    .getPublicUrl(storagePath);

  return publicUrlData.publicUrl;
}

async function uploadSlipImage(messageId) {
  const buffer = await getLineMessageContentBuffer(messageId);
  return uploadSlipImageFromBuffer(messageId, buffer);
}

async function saveDepositSlipAttachments({ depositId, messageIds }) {
  if (!depositId || !Array.isArray(messageIds) || messageIds.length === 0) return [];

  const uniqueMessageIds = [...new Set(messageIds.filter(Boolean))];
  const attachments = [];

  for (const messageId of uniqueMessageIds) {
    try {
      const buffer = await getLineMessageContentBuffer(messageId);
      const attachment = await uploadAttachmentBuffer({
        entityType: 'cash_deposit',
        entityId: depositId,
        storageDir: 'cash_deposit',
        fileName: `deposit_${messageId}.jpg`,
        contentType: 'image/jpeg',
        buffer,
      });
      attachments.push(attachment);
    } catch (err) {
      console.warn('Unable to save deposit slip attachment:', err.message || err, { depositId, messageId });
    }
  }

  const firstSlipUrl = attachments.find((attachment) => attachment && attachment.file_url)?.file_url;
  if (firstSlipUrl) {
    const { error } = await supabase
      .from('cash_deposits')
      .update({
        slip_url: firstSlipUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', depositId);

    if (error) {
      console.warn('Unable to update cash_deposits.slip_url:', error.message || error, { depositId });
    }
  }

  return attachments;
}

function normalizeDateString(value) {
  if (!value) return null;
  const text = String(value).trim();

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (slash) {
    const now = new Date();
    let year = slash[3] ? Number(slash[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    return buildIsoDate(year, Number(slash[2]), Number(slash[1]));
  }

  return null;
}

function buildIsoDate(year, month, day) {
  if (!year || !month || !day) return null;
  if (year > 2400) year -= 543;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const pad = (value) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function normalizeMoneyAmount(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;

  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function amountsMatch(expectedAmount, actualAmount) {
  const expected = normalizeMoneyAmount(expectedAmount);
  const actual = normalizeMoneyAmount(actualAmount);
  if (expected === null || actual === null) return false;
  return Math.abs(expected - actual) < 0.01;
}

function getDateCandidatesFromText(text) {
  const normalized = String(text || '');
  const matches = [];
  const patterns = [
    /\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/g,
    /\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const date = normalizeDateString(match[0]);
      if (date) matches.push({ value: match[0], date, index: match.index });
    }
  }

  return matches;
}

function extractDepositDateFromOcrText(text) {
  const candidates = getDateCandidatesFromText(text);
  if (candidates.length === 0) return null;

  const keywordCandidates = candidates.filter((candidate) => {
    const before = String(text).slice(Math.max(0, candidate.index - 40), candidate.index);
    return /date|วันที่|วัน|เวลา|ทำรายการ|transaction/i.test(before);
  });

  return (keywordCandidates[0] || candidates[0]).date;
}

function getAmountCandidatesFromText(text) {
  const normalized = String(text || '');
  const dateRanges = getDateCandidatesFromText(normalized).map((candidate) => [
    candidate.index,
    candidate.index + String(candidate.value).length,
  ]);
  const numberPattern = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g;
  const candidates = [];
  let match;

  while ((match = numberPattern.exec(normalized)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const insideDate = dateRanges.some(([dateStart, dateEnd]) => start >= dateStart && end <= dateEnd);
    if (insideDate) continue;

    const amount = normalizeMoneyAmount(raw);
    if (amount === null || amount <= 0 || amount > 10000000) continue;

    const digits = raw.replace(/\D/g, '');
    const looksLikeAccountNo = digits.length >= 7 && !raw.includes(',') && !raw.includes('.');
    if (looksLikeAccountNo) continue;

    const before = normalized.slice(Math.max(0, start - 50), start);
    const after = normalized.slice(end, Math.min(normalized.length, end + 20));
    const labeled = /amount|total|ยอด|จำนวน|จํานวน|เงิน|โอน|ฝาก|บาท|thb/i.test(`${before} ${after}`);
    candidates.push({ raw, amount, index: start, labeled });
  }

  return candidates;
}

function extractDepositAmountFromOcrText(text, expectedAmount) {
  const candidates = getAmountCandidatesFromText(text);
  if (candidates.length === 0) return null;

  const expected = normalizeMoneyAmount(expectedAmount);
  if (expected !== null) {
    const matching = candidates.find((candidate) => amountsMatch(expected, candidate.amount));
    if (matching) return matching.amount;
  }

  const labeled = candidates.filter((candidate) => candidate.labeled);
  const pool = labeled.length > 0 ? labeled : candidates;
  return pool.reduce((max, candidate) => candidate.amount > max.amount ? candidate : max, pool[0]).amount;
}

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const languages = process.env.TESSERACT_LANG || 'eng';
      const cachePath = process.env.TESSERACT_CACHE_PATH || path.join(os.tmpdir(), 'cruzy-tesseract-cache');
      const worker = await createWorker(languages, 1, { cachePath });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return worker;
    })().catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }

  return tesseractWorkerPromise;
}

async function ocrDepositSlip(buffer, options = {}) {
  if (process.env.DEPOSIT_OCR_ENABLED === 'false') {
    return { skipped: true, reason: 'deposit_ocr_disabled' };
  }

  const worker = await getTesseractWorker();
  const result = await worker.recognize(buffer);
  const text = result && result.data ? result.data.text || '' : '';
  const depositDate = extractDepositDateFromOcrText(text);
  const amount = extractDepositAmountFromOcrText(text, options.expectedAmount);

  return {
    skipped: false,
    depositDate,
    amount,
    rawText: text,
  };
}

async function verifyDepositSlip({ buffer, expectedAmount }) {
  const ocr = await ocrDepositSlip(buffer, { expectedAmount });
  if (ocr.skipped) return { ok: true, skipped: true, ocr };
  if (ocr.amount === null) {
    ocr.amount = extractDepositAmountFromOcrText(ocr.rawText, expectedAmount);
  }

  const normalizedExpectedAmount = normalizeMoneyAmount(expectedAmount);
  if (normalizedExpectedAmount !== null && ocr.amount === null) {
    return {
      ok: false,
      reason: 'missing_amount',
      actualDate: ocr.depositDate,
      expectedAmount: normalizedExpectedAmount,
      ocr,
    };
  }

  if (normalizedExpectedAmount !== null && !amountsMatch(normalizedExpectedAmount, ocr.amount)) {
    return {
      ok: false,
      reason: 'amount_mismatch',
      actualDate: ocr.depositDate,
      expectedAmount: normalizedExpectedAmount,
      actualAmount: ocr.amount,
      ocr,
    };
  }

  return {
    ok: true,
    actualDate: ocr.depositDate,
    expectedAmount: normalizedExpectedAmount,
    actualAmount: ocr.amount,
    ocr,
  };
}

async function recordDeposit({
  deposit_date,
  branch_id,
  deposited_by,
  deposited_amount,
  bank,
  bank_short,
  slip_url,
  source,
  line_group_id,
  line_user_id,
  message_text,
  submitted_at,
  bank_account_id,
}) {
  const explicitBankAccountId = bank_account_id || await resolveBankAccountId(bank, bank_short);
  const branchBankAccount = explicitBankAccountId ? null : await resolveBranchBankAccount(branch_id);
  const bankAccountId = explicitBankAccountId || (branchBankAccount && branchBankAccount.id) || null;
  const normalizedDepositDate = deposit_date || new Date().toISOString().slice(0,10);

  if (branch_id) {
    const { data: existing, error: fetchError } = await supabase
      .from('cash_deposits')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('deposit_date', normalizedDepositDate)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) {
      return existing;
    }
  }

  const payload = {
    deposit_date: normalizedDepositDate,
    branch_id,
    expected_amount: 0,
    deposited_amount: deposited_amount || 0,
    slip_url: slip_url || null,
    status: 'waiting',
    bank_account_id: bankAccountId,
    deposited_by: deposited_by || null,
    created_at: submitted_at || new Date().toISOString(),
    source: source || 'line',
    line_group_id: line_group_id || null,
    line_user_id: line_user_id || null,
    message_text: message_text || null,
    submitted_at: submitted_at || new Date().toISOString(),
  };

  const { data, error } = await supabase.from('cash_deposits').insert([payload]).select('*').single();
  if (error) throw error;
  return data;
}

module.exports = {
  recordDeposit,
  uploadSlipImage,
  uploadSlipImageFromBuffer,
  saveDepositSlipAttachments,
  getLineMessageContentBuffer,
  verifyDepositSlip,
  verifyDepositSlipDate: verifyDepositSlip,
  resolveBankAccountId,
  resolveBankAccount,
  resolveBranchBankAccount,
  _test: {
    normalizeMoneyAmount,
    amountsMatch,
    normalizeDateString,
    extractDepositDateFromOcrText,
    extractDepositAmountFromOcrText,
    ocrDepositSlip,
  },
};
