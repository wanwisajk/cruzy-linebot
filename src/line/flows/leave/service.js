const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const { logEvent } = require('../../utils/audit');

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
  };

  const { data, error } = await supabase.from('leaves').insert([payload]).select('*').single();
  if (error) throw error;

  await logEvent('leave_created', { leave: data, actor: employeeId });
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
  const payload = {
    status,
    decided_by: options.decidedBy || actor || null,
    decided_at: options.decidedAt || new Date().toISOString(),
  };

  if (options.actorType) payload.audit_actor_type = options.actorType;
  if (options.actorId) payload.audit_actor_id = String(options.actorId);
  if (options.actorName) payload.audit_actor_name = options.actorName;

  const { data, error } = await supabase
    .from('leaves')
    .update(payload)
    .eq('id', leaveId)
    .select('*,employees(name,nickname,line_user_id),branches(code,name)')
    .single();
  if (error) throw error;

  await logEvent('leave_status_updated', { leaveId, status, actor });
  return data;
}

module.exports = { createLeave, updateLeaveStatus, uploadLeaveAttachment };
