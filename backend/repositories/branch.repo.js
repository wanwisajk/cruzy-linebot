const { supabase } = require('../config/supabase');

async function findAllWithRegions() {
  const { data, error } = await supabase
    .from('branches')
    .select('id,name,code,regions(name)')
    .order('code', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findByCode(code) {
  const { data, error } = await supabase
    .from('branches')
    .select('id,name,code,regions(name)')
    .ilike('code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findAllWithRegions,
  findByCode,
};
