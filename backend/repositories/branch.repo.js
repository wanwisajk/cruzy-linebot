const { supabase } = require('../config/supabase');

async function findAllWithRegions() {
  const { data, error } = await supabase
    .from('branches')
    .select('id,name,code,line_group_id,regions(name)')
    .order('code', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findByCode(code) {
  const { data, error } = await supabase
    .from('branches')
    .select('id,name,code,line_group_id,regions(name)')
    .ilike('code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findByLineGroupId(lineGroupId) {
  const { data, error } = await supabase
    .from('branches')
    .select('id,name,code,line_group_id,regions(name)')
    .eq('line_group_id', lineGroupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateLineGroupId(id, lineGroupId) {
  const { data, error } = await supabase
    .from('branches')
    .update({ line_group_id: lineGroupId })
    .eq('id', id)
    .select('id,name,code,line_group_id')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateLineGroupIdByCode(code, lineGroupId) {
  const { data, error } = await supabase
    .from('branches')
    .update({ line_group_id: lineGroupId })
    .ilike('code', code)
    .select('id,name,code,line_group_id')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findAllWithRegions,
  findByCode,
  findByLineGroupId,
  updateLineGroupId,
  updateLineGroupIdByCode,
};
