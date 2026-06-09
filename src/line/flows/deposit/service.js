const { supabase } = require('../../../../backend/config/supabase');

async function recordDeposit({ deposited_by, deposited_amount, bank, slip_url }) {
  const payload = {
    deposit_date: new Date().toISOString().slice(0,10),
    branch_id: null,
    expected_amount: 0,
    deposited_amount: deposited_amount || 0,
    slip_url: slip_url || null,
    status: 'waiting',
    bank_account_id: null,
    deposited_by: deposited_by || null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('cash_deposits').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

module.exports = { recordDeposit };
