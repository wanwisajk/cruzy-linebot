const employeeRepo = require('../../../../backend/repositories/employee.repo');
const { supabase } = require('../../../../backend/config/supabase');
const closeFlex = require('../../flex/closeFlex');
const { replyOrPush } = require('../../reply');
const { logEvent } = require('../../utils/audit');
const { resolveBranchFromEvent } = require('../../utils/context');
const {
  parseDateFromText,
  parseTimeFromText,
  getBranchScheduleWindow,
  minutesOf,
  ensureAttendanceAlert,
  createAbsenceAlertsForBranchDay,
} = require('../../utils/attendance');

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text);
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ปิดร้าน CCA 20:00' }] });
    return;
  }

  const eventTime = event.timestamp ? new Date(event.timestamp) : new Date();
  const workDate = parseDateFromText(text, eventTime);
  const clockOut = parseTimeFromText(text, eventTime);
  const schedule = await getBranchScheduleWindow({
    employeeId: employee ? employee.id : null,
    branchId: branch.id,
    workDate,
  });
  const closedEarlyBy = Math.max(0, minutesOf(schedule.shiftEnd) - minutesOf(clockOut));

  if (employee && branch) {
    const { data: attendance } = await supabase
      .from('attendance')
      .select('id')
      .eq('employee_id', employee.id)
      .eq('branch_id', branch.id)
      .eq('work_date', workDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attendance) {
      const payload = {
        clock_out: clockOut,
        closed_early_minutes: closedEarlyBy,
        source: 'line',
        line_group_id: lineGroupId || null,
        line_user_id: lineUserId || null,
        message_text: text || null,
        submitted_at: eventTime.toISOString(),
      };
      const { error } = await supabase.from('attendance').update(payload).eq('id', attendance.id);
      if (error) {
        if (!isMissingColumnError(error)) throw error;
        await supabase.from('attendance').update({
          clock_out: clockOut,
          late_minutes: attendance.late_minutes || 0,
        }).eq('id', attendance.id);
      }
    } else {
      const payload = {
        employee_id: employee.id,
        branch_id: branch.id,
        work_date: workDate,
        clock_out: clockOut,
        closed_early_minutes: closedEarlyBy,
        source: 'line',
        line_group_id: lineGroupId || null,
        line_user_id: lineUserId || null,
        message_text: text || null,
        submitted_at: eventTime.toISOString(),
      };
      const { error } = await supabase.from('attendance').insert([payload]);
      if (error) {
        if (!isMissingColumnError(error)) throw error;
        await supabase.from('attendance').insert([{
          employee_id: employee.id,
          branch_id: branch.id,
          work_date: workDate,
          clock_out: clockOut,
        }]);
      }
    }

    if (closedEarlyBy > 0) {
      await ensureAttendanceAlert({
        alertType: 'closed_early',
        employeeId: employee.id,
        branchId: branch.id,
        workDate,
        title: 'ปิดร้านก่อนเวลา',
        detail: `${employee.nickname || employee.name} ปิดร้านเวลา ${clockOut.slice(0, 5)} ก่อนเวลา ${closedEarlyBy} นาที (เวลาปิด ${schedule.shiftEnd.slice(0, 5)})`,
        severity: 'warning',
        alertTime: clockOut,
      });
    }
  }

  await upsertStoreInspectionClose({
    employeeId: employee ? employee.id : null,
    branchId: branch.id,
    workDate,
    clockOut,
    closedEarlyBy,
    lineGroupId,
    lineUserId,
    messageText: text,
    submittedAt: eventTime.toISOString(),
  });

  await createAbsenceAlertsForBranchDay({ branchId: branch.id, workDate });

  await logEvent('close_shop_reported', {
    actor: employee ? employee.id : lineUserId,
    branch_id: branch.id,
    branch_code: branch.code,
    reported_at: eventTime.toISOString(),
    raw_text: text,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [closeFlex({
      branchCode: branch.code,
      employeeName: employee ? (employee.nickname || employee.name) : 'ไม่ระบุ',
      time: `${workDate} ${clockOut.slice(0, 5)}`,
      expectedTime: schedule.shiftEnd,
      closedEarlyBy,
    })],
  });
}

async function upsertStoreInspectionClose({
  employeeId,
  branchId,
  workDate,
  clockOut,
  closedEarlyBy,
  lineGroupId,
  lineUserId,
  messageText,
  submittedAt,
}) {
  const { data: existing, error: selectError } = await supabase
    .from('store_inspections')
    .select('id,submitted_by,submit_time,inspection_items')
    .eq('branch_id', branchId)
    .eq('work_date', workDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;

  const existingItems = existing && existing.inspection_items && typeof existing.inspection_items === 'object'
    ? existing.inspection_items
    : {};
  const inspectionItems = {
    ...existingItems,
    close_shop: true,
    close_time: clockOut,
    closed_early_minutes: closedEarlyBy || 0,
    close_message_text: messageText || null,
  };

  const payload = {
    close_time: clockOut,
    inspection_items: inspectionItems,
    source: 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    message_text: messageText || null,
    submitted_at: submittedAt || new Date().toISOString(),
  };

  if (existing) {
    if (!existing.submitted_by && employeeId) {
      payload.submitted_by = employeeId;
    }

    let { error } = await supabase
      .from('store_inspections')
      .update(payload)
      .eq('id', existing.id);

    if (error && isMissingColumnError(error)) {
      const fallbackPayload = {
        close_time: clockOut,
        inspection_items: inspectionItems,
      };
      if (!existing.submitted_by && employeeId) {
        fallbackPayload.submitted_by = employeeId;
      }
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
      submitted_by: employeeId || null,
      submit_time: clockOut,
      status: 'pass',
      inspection_items: inspectionItems,
      photo_count: 0,
      is_late: false,
      late_minutes: 0,
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
        submit_time: clockOut,
        close_time: clockOut,
        status: 'pass',
        inspection_items: inspectionItems,
        photo_count: 0,
        is_late: false,
        late_minutes: 0,
      }])
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data;
}

module.exports = { handle };
