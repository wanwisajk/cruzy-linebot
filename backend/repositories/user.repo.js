const { supabase } = require('../config/supabase');

async function findById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,role,scope_type,scope_value,line_user_id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findByLineUserId(lineUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,role,scope_type,scope_value,line_user_id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateLineUserId(id, lineUserId) {
  const { data, error } = await supabase
    .from('users')
    .update({ line_user_id: lineUserId })
    .eq('id', id)
    .select('id,username,name,role,scope_type,scope_value,line_user_id')
    .single();

  if (error) throw error;
  return data;
}

async function findBranchManagers(branch) {
  const scopeValues = [String(branch.id), branch.code, branch.name].filter(Boolean);
  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,role,scope_type,scope_value,line_user_id')
    .not('line_user_id', 'is', null)
    .in('scope_value', scopeValues);

  if (error) throw error;

  return (data || []).filter((user) =>
    String(user.role || '').toLowerCase().includes('manager') ||
    String(user.role || '').toLowerCase().includes('branch')
  );
}

module.exports = {
  findById,
  findByLineUserId,
  updateLineUserId,
  findBranchManagers,
};
