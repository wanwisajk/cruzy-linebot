const { supabase } = require('../config/supabase');
const { syncSaleCashLedger } = require('../services/branchCashLedger.service');

async function createSale(sale) {
  const { data, error } = await supabase
    .from('sales')
    .insert([sale])
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await syncSaleCashLedger(data);
  return data;
}

async function fetchRecentSalesWithBranch(limit = 50) {
  const { data, error } = await supabase
    .from('sales')
    .select('id,sell_date,cash_amount,transfer_amount,credit_amount,total_amount,status,submitted_at,branch_id,branches(code,name)')
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = {
  createSale,
  fetchRecentSalesWithBranch,
};
