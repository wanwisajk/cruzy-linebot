const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');

async function uploadSlipImage(messageId) {
  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
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

async function recordDeposit({ deposit_date, branch_id, deposited_by, deposited_amount, bank, slip_url }) {
  const payload = {
    deposit_date: deposit_date || new Date().toISOString().slice(0,10),
    branch_id,
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

module.exports = { recordDeposit, uploadSlipImage };
