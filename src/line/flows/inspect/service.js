const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');

function isMissingColumnError(error, columnName) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  if (!error) return false;
  if (columnName) {
    return error.code === 'PGRST204' || new RegExp(`\\b${columnName}\\b`, 'i').test(message) || /schema cache/i.test(message);
  }
  return error.code === 'PGRST204' || /column|schema cache/i.test(message);
}

async function findOpeningInspection({ branchId, workDate }) {
  const { data, error } = await supabase
    .from('store_inspections')
    .select('id,status,inspection_items,photo_count')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const items = data && data.inspection_items && typeof data.inspection_items === 'object'
    ? data.inspection_items
    : {};

  return items.open_shop ? data : null;
}

async function listInspectionAttachments(inspectionId) {
  if (!inspectionId) return [];

  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entity_type', 'store_inspection')
    .eq('entity_id', inspectionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

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
  auditActorType,
  auditActorId,
  auditActorName,
}) {
  const { data: existing, error: selectError } = await supabase
    .from('store_inspections')
    .select('id,inspection_items,submitted_by')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;

  const existingItems = existing && existing.inspection_items && typeof existing.inspection_items === 'object'
    ? existing.inspection_items
    : {};

  const payload = {
    branch_id: branchId,
    work_date: workDate,
    submitted_by: employeeId || null,
    submit_time: submitTime,
    status: 'pending',
    inspection_items: {
      ...existingItems,
      ...(inspectionItems || {}),
      inspected_shop: true,
    },
    photo_count: photoCount || 0,
    source: source || 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    message_text: messageText || null,
    submitted_at: submittedAt || null,
    created_at: submittedAt || new Date().toISOString(),
    audit_actor_type: auditActorType || null,
    audit_actor_id: auditActorId ? String(auditActorId) : null,
    audit_actor_name: auditActorName || null,
  };

  if (existing) {
    const updatePayload = { ...payload };
    delete updatePayload.branch_id;
    delete updatePayload.work_date;
    delete updatePayload.created_at;

    if (!employeeId && existing.submitted_by) {
      delete updatePayload.submitted_by;
    }

    let { data, error } = await supabase
      .from('store_inspections')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*,branches(code,name),employees(name,nickname,line_user_id)')
      .single();

    if (error) {
      const fallbackPayload = {
        submitted_by: updatePayload.submitted_by,
        submit_time: updatePayload.submit_time,
        status: updatePayload.status,
        inspection_items: updatePayload.inspection_items,
        photo_count: updatePayload.photo_count,
      };
      const retry = await supabase
        .from('store_inspections')
        .update(fallbackPayload)
        .eq('id', existing.id)
        .select('*,branches(code,name),employees(name,nickname,line_user_id)')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (!error) return data;
    throw error;
  }

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
    inspection_items: {
      ...existingItems,
      ...(inspectionItems || {}),
      inspected_shop: true,
    },
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

async function syncInspectionPhotoCount(inspectionId) {
  const { count, error: countError } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'store_inspection')
    .eq('entity_id', inspectionId);

  if (countError) throw countError;

  const photoCount = count || 0;
  const { data, error } = await supabase
    .from('store_inspections')
    .update({
      photo_count: photoCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inspectionId)
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .single();

  if (error) throw error;
  return { inspection: data, photoCount };
}

async function updateInspectionReview({ inspectionId, status, reviewedBy, reviewTime, managerNote, actorType, actorId }) {
  const payload = {
    status,
    reviewed_by: reviewedBy || null,
    review_time: reviewTime,
    manager_note: managerNote || null,
    line_notified: false,
    updated_at: new Date().toISOString(),
  };

  if (actorType) payload.audit_actor_type = actorType;
  if (actorId) payload.audit_actor_id = String(actorId);
  if (reviewedBy) payload.audit_actor_name = reviewedBy;

  const { data, error } = await supabase
    .from('store_inspections')
    .update(payload)
    .eq('id', inspectionId)
    .select('*,branches(code,name),employees(name,nickname,line_user_id)')
    .single();

  if (error) {
    if (isMissingColumnError(error, 'audit_actor_id') || isMissingColumnError(error, 'audit_actor_type')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.audit_actor_type;
      delete fallbackPayload.audit_actor_id;
      delete fallbackPayload.audit_actor_name;

      const retry = await supabase
        .from('store_inspections')
        .update(fallbackPayload)
        .eq('id', inspectionId)
        .select('*,branches(code,name),employees(name,nickname,line_user_id)')
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw error;
  }
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
  findOpeningInspection,
  listInspectionAttachments,
  createInspection,
  uploadInspectionAttachment,
  syncInspectionPhotoCount,
  updateInspectionReview,
  fetchInspectionById,
};
