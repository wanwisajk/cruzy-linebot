const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');

async function createInspection({
  branchId,
  employeeId,
  workDate,
  submitTime,
  photoCount,
  inspectionItems,
  source,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
}) {
  const payload = {
    branch_id: branchId,
    work_date: workDate,
    submitted_by: employeeId || null,
    submit_time: submitTime,
    status: 'pending',
    inspection_items: inspectionItems || {},
    photo_count: photoCount || 0,
    source: source || 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    message_text: messageText || null,
    submitted_at: submittedAt || null,
    created_at: submittedAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('store_inspections')
    .insert([payload])
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .single();

  if (!error) return data;

  const fallbackPayload = {
    branch_id: branchId,
    work_date: workDate,
    submitted_by: employeeId || null,
    submit_time: submitTime,
    status: 'pending',
    inspection_items: inspectionItems || {},
    photo_count: photoCount || 0,
    created_at: submittedAt || new Date().toISOString(),
  };

  const fallback = await supabase
    .from('store_inspections')
    .insert([fallbackPayload])
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .single();

  if (fallback.error) throw fallback.error;
  return fallback.data;
}

async function uploadInspectionAttachment({ inspectionId, messageId }) {
  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const fileName = `inspection_${messageId}.jpg`;
  const storagePath = `inspection/${inspectionId}/${Date.now()}_${fileName}`;

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

  const { data, error } = await supabase
    .from('attachments')
    .insert([{
      entity_type: 'store_inspection',
      entity_id: inspectionId,
      file_url: publicUrlData.publicUrl,
      storage_bucket: 'documents',
      storage_path: storagePath,
      file_name: fileName,
      file_type: 'image/jpeg',
      file_size: buffer.byteLength,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateInspectionReview({ inspectionId, status, reviewedBy, reviewTime, managerNote, actorType, actorId }) {
  const payload = {
    status,
    reviewed_by: reviewedBy || null,
    review_time: reviewTime,
    manager_note: managerNote || null,
  };

  if (actorType) payload.audit_actor_type = actorType;
  if (actorId) payload.audit_actor_id = String(actorId);

  const { data, error } = await supabase
    .from('store_inspections')
    .update(payload)
    .eq('id', inspectionId)
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .single();

  if (error) throw error;
  return data;
}

async function fetchInspectionById(inspectionId) {
  const { data, error } = await supabase
    .from('store_inspections')
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .eq('id', inspectionId)
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  createInspection,
  uploadInspectionAttachment,
  updateInspectionReview,
  fetchInspectionById,
};
