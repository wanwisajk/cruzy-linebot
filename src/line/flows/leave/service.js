const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const { logEvent } = require('../../utils/audit');
const { replyOrPush } = require('../../reply');
const leaveFlex = require('../../flex/leaveFlex');

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

  if (!options.skipNotification && data) {
    const employeeLineId = (data.employees && data.employees.line_user_id) || data.line_user_id;
    if (employeeLineId && (status === 'approved' || status === 'rejected')) {
      const resultFlex = leaveFlex({
        id: data.id,
        employeeName: data.employees ? (data.employees.nickname || data.employees.name) : '-',
        branchCode: data.branches ? data.branches.code : '-',
        type: data.leave_type,
        from: data.start_date,
        to: data.end_date,
        daysCount: data.days_count,
        reason: data.reason,
        status,
        approvedBy: options.decidedBy || options.actorName || 'ผู้จัดการ',
      });

      try {
        await replyOrPush({ to: employeeLineId, messages: [resultFlex] });
      } catch (notificationError) {
        console.warn('Leave notification push failed:', notificationError.message || notificationError, { leaveId, employeeLineId });
      }
    } else if (status === 'approved' || status === 'rejected') {
      console.warn('Leave update did not send notification because no line_user_id was available', { leaveId, status, line_user_id: data.line_user_id, employeeLineId: data.employees && data.employees.line_user_id });
    }
  }

  return data;
}

module.exports = { createLeave, updateLeaveStatus, uploadLeaveAttachment };
