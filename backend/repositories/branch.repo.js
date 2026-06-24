const { supabase } = require('../config/supabase');

const BRANCH_COLUMNS = 'id,name,code,region_id,line_group_id,line_group_name,regions(name)';
const BRANCH_COLUMNS_FALLBACK = 'id,name,code,region_id,line_group_id,regions(name)';

function isMissingLineGroupNameError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''} ${error && error.hint || ''}`;
  return error && (
    error.code === 'PGRST204' ||
    /line_group_name|column|schema cache/i.test(message)
  );
}

async function retryWithoutLineGroupName(error, queryFactory) {
  if (!isMissingLineGroupNameError(error)) throw error;
  const { data, error: retryError } = await queryFactory(BRANCH_COLUMNS_FALLBACK);
  if (retryError) throw retryError;
  return data;
}

async function findAllWithRegions() {
  const { data, error } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .order('code', { ascending: true });

  if (error) {
    return retryWithoutLineGroupName(error, (columns) => supabase
      .from('branches')
      .select(columns)
      .order('code', { ascending: true }));
  }

  return data || [];
}

async function findByCode(code) {
  const { data, error } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .ilike('code', code)
    .maybeSingle();

  if (error) {
    return retryWithoutLineGroupName(error, (columns) => supabase
      .from('branches')
      .select(columns)
      .ilike('code', code)
      .maybeSingle());
  }

  return data;
}

async function findByLineGroupId(lineGroupId) {
  const { data, error } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .eq('line_group_id', lineGroupId)
    .maybeSingle();

  if (error) {
    return retryWithoutLineGroupName(error, (columns) => supabase
      .from('branches')
      .select(columns)
      .eq('line_group_id', lineGroupId)
      .maybeSingle());
  }

  return data;
}

async function updateLineGroupId(id, lineGroupId, lineGroupName = null) {
  const payload = { line_group_id: lineGroupId };
  if (lineGroupName !== undefined) payload.line_group_name = lineGroupName;

  const { data, error } = await supabase
    .from('branches')
    .update(payload)
    .eq('id', id)
    .select('id,name,code,line_group_id,line_group_name')
    .single();

  if (error) {
    if (!isMissingLineGroupNameError(error)) throw error;
    const retry = await supabase
      .from('branches')
      .update({ line_group_id: lineGroupId })
      .eq('id', id)
      .select('id,name,code,line_group_id')
      .single();
    if (retry.error) throw retry.error;
    return retry.data;
  }

  return data;
}

async function updateLineGroupIdByCode(code, lineGroupId, lineGroupName = null) {
  const payload = { line_group_id: lineGroupId };
  if (lineGroupName !== undefined) payload.line_group_name = lineGroupName;

  const { data, error } = await supabase
    .from('branches')
    .update(payload)
    .ilike('code', code)
    .select('id,name,code,line_group_id,line_group_name')
    .single();

  if (error) {
    if (!isMissingLineGroupNameError(error)) throw error;
    const retry = await supabase
      .from('branches')
      .update({ line_group_id: lineGroupId })
      .ilike('code', code)
      .select('id,name,code,line_group_id')
      .single();
    if (retry.error) throw retry.error;
    return retry.data;
  }

  return data;
}

async function searchByKeyword(keyword, limit = 8) {
  const value = String(keyword || '').trim().replace(/[,%]/g, ' ');
  if (!value) return [];

  const { data, error } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .or(`code.ilike.%${value}%,name.ilike.%${value}%`)
    .order('code', { ascending: true })
    .limit(limit);

  if (error) {
    return retryWithoutLineGroupName(error, (columns) => supabase
      .from('branches')
      .select(columns)
      .or(`code.ilike.%${value}%,name.ilike.%${value}%`)
      .order('code', { ascending: true })
      .limit(limit));
  }

  return data || [];
}

module.exports = {
  findAllWithRegions,
  findByCode,
  findByLineGroupId,
  searchByKeyword,
  updateLineGroupId,
  updateLineGroupIdByCode,
};
