const { supabase } = require('../../../../backend/config/supabase');

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

async function recordOpen({
  employeeId,
  branchId,
  messageId,
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
}) {
  const record = {
    employee_id: employeeId || null,
    branch_id: branchId || null,
    message_id: messageId || null,
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
      await upsertStoreInspectionOpen({
        employeeId,
        branchId,
        workDate,
        clockIn,
        lateBy,
        hasImage,
        source,
        lineGroupId,
        lineUserId,
        messageText: messageText || rawText,
        submittedAt: submittedAt || timestamp,
      });
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
      actor_id: employeeId ? String(employeeId) : null,
    }]);
  } catch (e) {
    // ignore
  }

  return record;
}

async function upsertStoreInspectionOpen({
  employeeId,
  branchId,
  workDate,
  clockIn,
  lateBy,
  hasImage,
  source,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
}) {
  const payload = {
    submitted_by: employeeId || null,
    submit_time: clockIn,
    status: 'pass',
    inspection_items: {
      open_shop: true,
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
  };

  const { data: existing, error: selectError } = await supabase
    .from('store_inspections')
    .select('id')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    let { error } = await supabase
      .from('store_inspections')
      .update(payload)
      .eq('id', existing.id);

    if (error && isMissingColumnError(error)) {
      const fallbackPayload = {
        submitted_by: employeeId || null,
        submit_time: clockIn,
        status: 'pass',
        inspection_items: payload.inspection_items,
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
    return existing;
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
        status: 'pass',
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

module.exports = {
  recordOpen,
};
