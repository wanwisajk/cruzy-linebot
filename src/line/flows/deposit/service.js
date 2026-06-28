const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const { uploadAttachmentBuffer } = require('../../../../backend/services/attachment.service');
const { syncDepositLedger } = require('../../../../backend/services/branchCashLedger.service');

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

function isVerifiedByForeignKeyError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (
    error.code === '23503' ||
    /cash_deposits_verified_by_fkey|foreign key constraint/i.test(message)
  );
}

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

async function fetchSalesCashSnapshot({ branchId, sellDate }) {
  if (!branchId || !sellDate) return { amount: 0, count: 0, sales: [] };

  const { data, error } = await supabase
    .from('sales')
    .select('id,cash_amount,status')
    .eq('branch_id', branchId)
    .eq('sell_date', sellDate)
    .neq('status', 'rejected');

  if (error) throw error;

  const sales = data || [];
  const amount = sales.reduce((sum, sale) => {
    const value = normalizeMoneyAmount(sale.cash_amount) || 0;
    return sum + value;
  }, 0);

  return { amount, count: sales.length, sales };
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

function normalizeMoneyAmount(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;

  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

async function recordDeposit({
  deposit_date,
  branch_id,
  deposited_by,
  expected_amount,
  deposited_amount,
  variance_amount,
  bank,
  bank_short,
  slip_url,
  source,
  line_group_id,
  line_user_id,
  message_text,
  submitted_at,
  bank_account_id,
  covered_date,
  auditActorType,
  auditActorId,
  auditActorName,
}) {
  const explicitBankAccountId = bank_account_id || await resolveBankAccountId(bank, bank_short);
  const branchBankAccount = explicitBankAccountId ? null : await resolveBranchBankAccount(branch_id);
  const bankAccountId = explicitBankAccountId || (branchBankAccount && branchBankAccount.id) || null;
  const normalizedDepositDate = deposit_date || new Date().toISOString().slice(0,10);
  const submittedAtValue = submitted_at || new Date().toISOString();
  const depositedAmount = normalizeMoneyAmount(deposited_amount) || 0;
  const expectedAmount = normalizeMoneyAmount(expected_amount);
  const varianceAmount = variance_amount !== undefined && variance_amount !== null
    ? normalizeMoneyAmount(variance_amount)
    : null;
  const finalExpectedAmount = expectedAmount !== null ? expectedAmount : depositedAmount + (varianceAmount || 0);
  const finalVarianceAmount = varianceAmount !== null ? varianceAmount : finalExpectedAmount - depositedAmount;

  if (branch_id && line_user_id && message_text && submitted_at) {
    const { data: existing, error: fetchError } = await supabase
      .from('cash_deposits')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('line_user_id', line_user_id)
      .eq('submitted_at', submittedAtValue)
      .eq('message_text', message_text)
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) {
      await syncDepositLedger(existing);
      return { ...existing, __duplicate: true };
    }
  }

  const payload = {
    deposit_date: normalizedDepositDate,
    branch_id,
    expected_amount: finalExpectedAmount,
    deposited_amount: depositedAmount,
    slip_url: slip_url || null,
    status: 'waiting',
    bank_account_id: bankAccountId,
    deposited_by: deposited_by || null,
    created_at: submitted_at || new Date().toISOString(),
    source: source || 'line',
    line_group_id: line_group_id || null,
    line_user_id: line_user_id || null,
    message_text: message_text || null,
    submitted_at: submittedAtValue,
    covered_date: covered_date || null,
    variance_amount: finalVarianceAmount,
    audit_actor_type: auditActorType || null,
    audit_actor_id: auditActorId ? String(auditActorId) : null,
    audit_actor_name: auditActorName || null,
  };

  const { data, error } = await supabase.from('cash_deposits').insert([payload]).select('*').single();
  if (error) throw error;
  await syncDepositLedger(data);
  return data;
}

async function updateDepositStatusWithTimestamp(depositId, status, options = {}) {
  const payload = {
    status,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (options.verifiedByUsername) {
    payload.verified_by = options.verifiedByUsername;
  }

  if (typeof options.lineNotified === 'boolean') {
    payload.line_notified = options.lineNotified;
  }

  if (options.auditActorType) payload.audit_actor_type = options.auditActorType;
  if (options.auditActorId) payload.audit_actor_id = String(options.auditActorId);
  if (options.auditActorName) payload.audit_actor_name = options.auditActorName;

  let query = supabase
    .from('cash_deposits')
    .update(payload)
    .eq('id', depositId);

  if (Array.isArray(options.expectedStatuses) && options.expectedStatuses.length > 0) {
    query = query.in('status', options.expectedStatuses);
  }

  let { data, error } = await query.select('*').maybeSingle();

  if (error && (isMissingColumnError(error) || isVerifiedByForeignKeyError(error))) {
    const missingColumn = isMissingColumnError(error);
    const fallbackPayload = {
      status: payload.status,
      verified_at: payload.verified_at,
      updated_at: payload.updated_at,
    };

    if (!missingColumn && typeof options.lineNotified === 'boolean') {
      fallbackPayload.line_notified = options.lineNotified;
    }
    if (!missingColumn && options.auditActorType) fallbackPayload.audit_actor_type = options.auditActorType;
    if (!missingColumn && options.auditActorId) fallbackPayload.audit_actor_id = String(options.auditActorId);
    if (!missingColumn && options.auditActorName) fallbackPayload.audit_actor_name = options.auditActorName;

    let retryQuery = supabase
      .from('cash_deposits')
      .update(fallbackPayload)
      .eq('id', depositId);
    if (Array.isArray(options.expectedStatuses) && options.expectedStatuses.length > 0) {
      retryQuery = retryQuery.in('status', options.expectedStatuses);
    }
    const retry = await retryQuery.select('*').maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data;
}

module.exports = {
  recordDeposit,
  updateDepositStatusWithTimestamp,
  uploadSlipImage,
  uploadSlipImageFromBuffer,
  saveDepositSlipAttachments,
  getLineMessageContentBuffer,
  resolveBankAccountId,
  resolveBankAccount,
  resolveBranchBankAccount,
  fetchSalesCashSnapshot,
  _test: {
    normalizeMoneyAmount,
    isVerifiedByForeignKeyError,
  },
};
