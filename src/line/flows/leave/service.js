const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const { logEvent } = require('../../utils/audit');

const LEAVE_SELECT = `
  *,
  employees(id,name,nickname,line_user_id,regions(name)),
  branches(id,name,code,line_group_id,region_id,regions(id,name))
`;

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

async function createLeave({
  employeeId,
  branchId,
  type,
  startDate,
  endDate,
  daysCount,
  reason,
  source,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
  actorType,
  actorId,
  actorName,
}) {
  const payload = {
    employee_id: employeeId,
    branch_id: branchId || null,
    leave_type: type,
    start_date: startDate,
    end_date: endDate,
    days_count: daysCount || 1,
    reason: reason || null,
    status: 'pending',
    source: source || 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    message_text: messageText || null,
    submitted_at: submittedAt || new Date().toISOString(),
    audit_actor_type: actorType || null,
    audit_actor_id: actorId ? String(actorId) : null,
    audit_actor_name: actorName || null,
  };

  const { data, error } = await supabase.from('leaves').insert([payload]).select('*').single();
  if (error) throw error;

  await logEvent('leave_created', {
    leave: data,
    actorType: actorType || (employeeId ? 'employee' : 'line'),
    actorId: actorId || employeeId || null,
  });
  return data;
}

async function uploadLeaveAttachment({ leaveId, message }) {
  const messageId = typeof message === 'string' ? message : message && message.id;
  if (!messageId) throw new Error('Missing LINE message id');

  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const fileNameFromLine = message && (message.fileName || message.filename);
  const isPdf = message && message.type === 'file' && String(fileNameFromLine || '').toLowerCase().endsWith('.pdf');
  const contentType = isPdf ? 'application/pdf' : 'image/jpeg';
  const fileName = isPdf ? `leave_${messageId}.pdf` : `leave_${messageId}.jpg`;
  const storagePath = `leave/${leaveId}/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from('documents')
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('attachments')
    .insert([{
      entity_type: 'leave',
      entity_id: leaveId,
      file_url: publicUrlData.publicUrl,
      storage_bucket: 'documents',
      storage_path: storagePath,
      file_name: fileName,
      file_type: contentType,
      file_size: buffer.byteLength,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateLeaveStatus(leaveId, status, actor, options = {}) {
  const decidedAt = options.decidedAt || new Date().toISOString();
  const editedBy = options.editedBy || options.decidedBy || actor || null;
  const payload = {
    status,
    decided_by: options.decidedBy || actor || null,
    decided_at: decidedAt,
    updated_at: decidedAt,
    edited_by: editedBy,
    line_notified: false,
  };

  if (options.actorType) payload.audit_actor_type = options.actorType;
  if (options.actorId) payload.audit_actor_id = String(options.actorId);
  if (options.actorName) payload.audit_actor_name = options.actorName;

  let { data, error } = await supabase
    .from('leaves')
    .update(payload)
    .eq('id', leaveId)
    .select('*,employees(name,nickname,line_user_id),branches(code,name)')
    .single();

  if (error && isMissingColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.updated_at;
    delete fallbackPayload.edited_by;
    delete fallbackPayload.line_notified;

    const retry = await supabase
      .from('leaves')
      .update(fallbackPayload)
      .eq('id', leaveId)
      .select('*,employees(name,nickname,line_user_id),branches(code,name)')
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  await logEvent('leave_status_updated', { leaveId, status, actor });

  return data;
}

async function fetchLeaveById(leaveId) {
  const { data, error } = await supabase
    .from('leaves')
    .select(LEAVE_SELECT)
    .eq('id', leaveId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchLatestPendingLeaveForEmployee(employeeId) {
  if (!employeeId) return null;

  const { data, error } = await supabase
    .from('leaves')
    .select(LEAVE_SELECT)
    .eq('employee_id', employeeId)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function countLeaveAttachments(leaveId) {
  if (!leaveId) return 0;

  const { count, error } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'leave')
    .eq('entity_id', leaveId);

  if (error) {
    console.warn('Unable to count leave attachments:', error.message || error, { leaveId });
    return 0;
  }

  return count || 0;
}

function buildAreaScopeValues(leave) {
  const branch = leave && leave.branches;
  const region = branch && branch.regions;
  return [
    region && region.id,
    region && region.name,
    branch && branch.region_id,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim());
}

async function findAreaApproversForLeave(leave) {
  const scopeValues = buildAreaScopeValues(leave);
  if (scopeValues.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,role,scope_type,scope_value,line_user_id')
    .not('line_user_id', 'is', null)
    .ilike('role', 'area')
    .in('scope_value', scopeValues);

  if (error) throw error;

  return (data || []).filter((user) => {
    const scopeType = String(user.scope_type || '').toLowerCase();
    return ['province', 'จังหวัด', 'region', 'area'].some((value) => scopeType.includes(value));
  });
}

module.exports = {
  createLeave,
  updateLeaveStatus,
  uploadLeaveAttachment,
  fetchLeaveById,
  fetchLatestPendingLeaveForEmployee,
  countLeaveAttachments,
  findAreaApproversForLeave,
};
