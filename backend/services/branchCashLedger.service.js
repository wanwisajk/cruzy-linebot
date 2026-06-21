const { supabase } = require('../config/supabase');

function toAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const amount = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

async function upsertLedgerEntry({ match, payload }) {
  const { data: existing, error: fetchError } = await supabase
    .from('branch_cash_ledger')
    .select('id')
    .match(match)
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing && existing.id) {
    const { data, error } = await supabase
      .from('branch_cash_ledger')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('branch_cash_ledger')
    .insert([payload])
    .select('*')
    .single();

  if (error && error.code === '23505') {
    const { data: retryData, error: retryError } = await supabase
      .from('branch_cash_ledger')
      .update(payload)
      .match(match)
      .select('*')
      .single();
    if (retryError) throw retryError;
    return retryData;
  }

  if (error) throw error;
  return data;
}

async function syncSaleCashLedger(sale) {
  if (!sale || !sale.id) return null;

  const amount = toAmount(sale.cash_amount);
  if (!amount) {
    return deleteSaleCashLedger(sale.id);
  }

  return upsertLedgerEntry({
    match: { sale_id: sale.id, entry_type: 'sale_cash' },
    payload: {
      branch_id: sale.branch_id,
      ledger_date: sale.sell_date,
      entry_type: 'sale_cash',
      sale_id: sale.id,
      cash_deposit_id: null,
      amount,
      note: null,
    },
  });
}

async function syncDepositLedger(deposit) {
  if (!deposit || !deposit.id) return null;

  const depositedAmount = toAmount(deposit.deposited_amount);
  if (!depositedAmount) {
    return deleteDepositLedger(deposit.id);
  }

  return upsertLedgerEntry({
    match: { cash_deposit_id: deposit.id, entry_type: 'deposit' },
    payload: {
      branch_id: deposit.branch_id,
      ledger_date: deposit.covered_date || deposit.deposit_date,
      entry_type: 'deposit',
      sale_id: null,
      cash_deposit_id: deposit.id,
      amount: -depositedAmount,
      note: null,
    },
  });
}

async function deleteSaleCashLedger(saleId) {
  if (!saleId) return null;
  const { error } = await supabase
    .from('branch_cash_ledger')
    .delete()
    .eq('sale_id', saleId)
    .eq('entry_type', 'sale_cash');
  if (error) throw error;
  return null;
}

async function deleteDepositLedger(depositId) {
  if (!depositId) return null;
  const { error } = await supabase
    .from('branch_cash_ledger')
    .delete()
    .eq('cash_deposit_id', depositId)
    .eq('entry_type', 'deposit');
  if (error) throw error;
  return null;
}

async function getBranchCashPending(branchId) {
  if (!branchId) return 0;

  const { data, error } = await supabase
    .from('branch_cash_ledger')
    .select('amount')
    .eq('branch_id', branchId);

  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + toAmount(row.amount), 0);
}

module.exports = {
  syncSaleCashLedger,
  syncDepositLedger,
  deleteSaleCashLedger,
  deleteDepositLedger,
  getBranchCashPending,
  _test: {
    toAmount,
  },
};
