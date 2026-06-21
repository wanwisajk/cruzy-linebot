const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

async function recordOpen({
  employeeId,
  branchId,
  messageId,
  imageMessageId,
  hasImage,
  timestamp,
  rawText,
  workDate,
  clockIn,
  lateBy,
  source,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
  auditActorType,
  auditActorId,
  auditActorName,
}) {
  let inspectionRecord = null;
  let attachment = null;
  const record = {
    employee_id: employeeId || null,
    branch_id: branchId || null,
    message_id: imageMessageId || messageId || null,
    has_image: hasImage ? true : false,
    raw_text: rawText || null,
    opened_at: timestamp || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (employeeId && branchId) {
    try {
      const attendancePayload = {
        employee_id: employeeId,
        branch_id: branchId,
        work_date: workDate,
        clock_in: clockIn,
        late_minutes: lateBy || 0,
        source: source || 'line',
        line_group_id: lineGroupId || null,
        line_user_id: lineUserId || null,
        message_text: messageText || rawText || null,
        submitted_at: submittedAt || timestamp || new Date().toISOString(),
      };
      const { error } = await supabase.from('attendance').insert([attendancePayload]);
      if (error) {
        if (!isMissingColumnError(error)) throw error;
        await supabase.from('attendance').insert([{
          employee_id: employeeId,
          branch_id: branchId,
          work_date: workDate,
          clock_in: clockIn,
          late_minutes: lateBy || 0,
        }]);
      }
    } catch (err) {
      console.warn('Unable to record opening attendance:', err.message || err);
    }
  }

  if (branchId) {
    try {
      inspectionRecord = await upsertStoreInspectionOpen({
        employeeId,
        branchId,
        workDate,
        clockIn,
        lateBy,
        hasImage,
        messageId: imageMessageId || messageId,
        source,
        lineGroupId,
        lineUserId,
        messageText: messageText || rawText,
        submittedAt: submittedAt || timestamp,
        auditActorType,
        auditActorId,
        auditActorName,
      });

      if (hasImage && (imageMessageId || messageId) && inspectionRecord && inspectionRecord.id) {
        attachment = await uploadOpenAttachment({
          inspectionId: inspectionRecord.id,
          messageId: imageMessageId || messageId,
          inspectionItems: inspectionRecord.inspection_items,
        });
      }
    } catch (err) {
      console.warn('Unable to update store inspection opening:', err.message || err);
    }
  }

  try {
    await supabase.from('system_audit_logs').insert([{
      user_name: 'line_bot',
      action: 'open_shop',
      table_name: 'attendance',
      record_id: employeeId ? String(employeeId) : null,
      source: 'line',
      description: rawText || 'เปิดร้าน',
      new_value: record,
      branch_id: branchId || null,
      actor_type: 'line',
      actor_id: lineUserId || (employeeId ? String(employeeId) : null),
    }]);
  } catch (e) {
    // ignore
  }

  return {
    ...record,
    inspection_id: inspectionRecord ? inspectionRecord.id : null,
    attachment_url: attachment ? attachment.file_url : null,
  };
}

async function upsertStoreInspectionOpen({
  employeeId,
  branchId,
  workDate,
  clockIn,
  lateBy,
  hasImage,
  messageId,
  source,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
  auditActorType,
  auditActorId,
  auditActorName,
}) {
  const payload = {
    submitted_by: employeeId || null,
    submit_time: clockIn,
    status: 'opened',
    inspection_items: {
      open_shop: true,
      shopfront_image: hasImage ? true : false,
      open_photo_message_id: messageId || null,
      source: source || 'line',
      message_text: messageText || null,
    },
    photo_count: hasImage ? 1 : 0,
    is_late: Boolean(lateBy && lateBy > 0),
    late_minutes: lateBy || 0,
    source: source || 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    message_text: messageText || null,
    submitted_at: submittedAt || new Date().toISOString(),
    audit_actor_type: auditActorType || null,
    audit_actor_id: auditActorId ? String(auditActorId) : null,
    audit_actor_name: auditActorName || null,
  };

  const { data: existing, error: selectError } = await supabase
    .from('store_inspections')
    .select('id,inspection_items')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const existingItems = existing.inspection_items && typeof existing.inspection_items === 'object'
      ? existing.inspection_items
      : {};
    const updatePayload = {
      ...payload,
      inspection_items: {
        ...existingItems,
        ...payload.inspection_items,
      },
    };

    let { error } = await supabase
      .from('store_inspections')
      .update(updatePayload)
      .eq('id', existing.id);

    if (error && isMissingColumnError(error)) {
      const fallbackPayload = {
        submitted_by: employeeId || null,
        submit_time: clockIn,
        status: 'opened',
        inspection_items: updatePayload.inspection_items,
        photo_count: hasImage ? 1 : 0,
        is_late: Boolean(lateBy && lateBy > 0),
        late_minutes: lateBy || 0,
      };
      const retry = await supabase
        .from('store_inspections')
        .update(fallbackPayload)
        .eq('id', existing.id);
      error = retry.error;
    }

    if (error) throw error;
    return { ...existing, inspection_items: updatePayload.inspection_items };
  }

  let { data, error } = await supabase
    .from('store_inspections')
    .insert([{
      branch_id: branchId,
      work_date: workDate,
      ...payload,
    }])
    .select()
    .single();

  if (error && isMissingColumnError(error)) {
    const retry = await supabase
      .from('store_inspections')
      .insert([{
        branch_id: branchId,
        work_date: workDate,
        submitted_by: employeeId || null,
        submit_time: clockIn,
        status: 'opened',
        inspection_items: payload.inspection_items,
        photo_count: hasImage ? 1 : 0,
        is_late: Boolean(lateBy && lateBy > 0),
        late_minutes: lateBy || 0,
      }])
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data;
}

async function uploadOpenAttachment({ inspectionId, messageId, inspectionItems }) {
  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const fileName = `open_shop_${messageId}.jpg`;
  const storagePath = `open/${inspectionId}/${Date.now()}_${fileName}`;

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

  const publicUrl = publicUrlData.publicUrl;
  const { data, error } = await supabase
    .from('attachments')
    .insert([{
      entity_type: 'store_inspection',
      entity_id: inspectionId,
      file_url: publicUrl,
      storage_bucket: 'documents',
      storage_path: storagePath,
      file_name: fileName,
      file_type: 'image/jpeg',
      file_size: buffer.byteLength,
      metadata: {
        source: 'opening_general',
        lineMessageId: messageId,
      },
    }])
    .select('*')
    .single();

  if (error) throw error;

  try {
    const items = inspectionItems && typeof inspectionItems === 'object' ? inspectionItems : {};
    await supabase
      .from('store_inspections')
      .update({
        inspection_items: {
          ...items,
          open_shop: true,
          shopfront_image: true,
          open_photo_message_id: messageId,
          open_photo_url: publicUrl,
        },
        photo_count: 1,
      })
      .eq('id', inspectionId);
  } catch (err) {
    console.warn('Unable to update opening photo metadata:', err.message || err);
  }

  return data;
}

module.exports = {
  recordOpen,
  uploadOpenAttachment,
};
