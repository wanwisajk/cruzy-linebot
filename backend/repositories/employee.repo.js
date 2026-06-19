const { supabase } = require('../config/supabase');

async function findByLineUserId(lineUserId) {
  const { data, error } = await supabase
    .from('employees')
    .select('id,name,nickname,position,phone,emp_type,line_user_id,regions(name)')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function searchByName(keyword) {
  const { data, error } = await supabase
    .from('employees')
    .select('id,name,nickname,position,phone,emp_type,regions(name)')
    .ilike('name', `%${keyword}%`)
    .limit(10);

  if (error) {
    throw error;
  }

  return data || [];
}

async function findById(id) {
  const { data, error } = await supabase
    .from('employees')
    .select('id,name,nickname,position,phone,emp_type,line_user_id,regions(name)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findByUserIdentity(user) {
  if (!user) return null;

  const scopeType = String(user.scope_type || '').toLowerCase();
  const employeeScopeTypes = new Set(['employee', 'empolyee', 'staff', 'worker']);
  const scopeValue = String(user.scope_value || '').trim();
  if (employeeScopeTypes.has(scopeType) && scopeValue) {
    return findById(scopeValue);
  }

  return null;
}

async function updateLineUserId(id, lineUserId) {
  const { data, error } = await supabase
    .from('employees')
    .update({ line_user_id: lineUserId })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findByLineUserId,
  searchByName,
  findById,
  findByUserIdentity,
  updateLineUserId,
};
