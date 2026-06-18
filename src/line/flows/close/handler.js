const { supabase } = require('../../../../backend/config/supabase');
const { blobClient } = require('../../../../backend/config/line');
const closeFlex = require('../../flex/closeFlex');
const { replyOrPush } = require('../../reply');
const { logEvent } = require('../../utils/audit');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const { getDisplayName } = require('../../utils/displayName');
const {
  parseDateFromText,
  parseTimeFromText,
  getBranchScheduleWindow,
  minutesOf,
  ensureAttendanceAlert,
  createAbsenceAlertsForBranchDay,
} = require('../../utils/attendance');
const {
  CLOSE_STATUS,
  IMAGE_WINDOW_MS,
  getCloseStateKey,
  getCloseState,
  setCloseState,
  updateCloseState,
  clearCloseState,
  hasCloseState,
  setRecentCloseImage,
  consumeRecentCloseImage,
  setReminderTimer,
  clearReminderTimer,
} = require('./state');

const MISSING_IMAGE_TEXT = 'กรุณาแนบรูปหน้าร้านที่ปิดเรียบร้อยแล้ว (รูปถ่ายตอนร้านปิดไฟ ก่อนออกจากร้านเท่านั้น)';

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

function getReplyTarget(source = {}) {
  return source.groupId || source.roomId || source.userId || null;
}

function scheduleMissingImageReminder(stateKey, target) {
  if (!target) return;

  const timer = setTimeout(async () => {
    const state = getCloseState(stateKey);
    if (!state || state.status !== CLOSE_STATUS.AWAITING_IMAGE || state.reminderSent) return;

    updateCloseState(stateKey, { reminderSent: true });

    try {
      await replyOrPush({
        to: target,
        messages: [{ type: 'text', text: MISSING_IMAGE_TEXT }],
      });
    } catch (err) {
      console.warn('Unable to send closing image reminder:', err.message || err);
    }
  }, IMAGE_WINDOW_MS);

  setReminderTimer(stateKey, timer);
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const stateKey = getCloseStateKey(source);
  const actorInfo = lineUserId ? await resolveLineActor(lineUserId) : null;
  const employee = actorInfo && actorInfo.employee ? actorInfo.employee : null;
  const actorName = getDisplayName(employee, actorInfo && actorInfo.user, actorInfo && actorInfo.name, lineUserId);
  const eventTime = event.timestamp ? new Date(event.timestamp) : new Date();
  const workDate = parseDateFromText(text, eventTime);

  const { branch, lineGroupId } = await resolveBranchFromEvent(event, text, {
    employeeId: employee ? employee.id : null,
    workDate,
  });
  if (!branch) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ไม่พบสาขา กรุณาผูกกลุ่มด้วยคำสั่ง: สาขา <id> หรือพิมพ์เช่น ปิดร้าน CCA 20:00' }] });
    return;
  }

  const clockOut = parseTimeFromText(text, eventTime);
  const schedule = await getBranchScheduleWindow({
    employeeId: employee ? employee.id : null,
    branchId: branch.id,
    workDate,
  });
  const closedEarlyBy = Math.max(0, minutesOf(schedule.shiftEnd) - minutesOf(clockOut));
  const closeState = {
    status: CLOSE_STATUS.AWAITING_IMAGE,
    employeeId: employee ? employee.id : null,
    actorType: actorInfo && actorInfo.user && actorInfo.employeeResolvedBy === 'user_identity' ? 'user' : actorInfo && actorInfo.type,
    actorId: actorInfo && actorInfo.user && actorInfo.employeeResolvedBy === 'user_identity' ? actorInfo.user.id : actorInfo && actorInfo.id,
    actorName,
    branchId: branch.id,
    branchCode: branch.code,
    lineGroupId,
    lineUserId,
    messageText: text,
    workDate,
    clockOut,
    expectedTime: schedule.shiftEnd,
    closedEarlyBy,
    submittedAt: eventTime.toISOString(),
    target: getReplyTarget(source),
  };

  const pendingImage = consumeRecentCloseImage(stateKey);
  if (pendingImage && pendingImage.messageId) {
    return completeClose({
      event,
      stateKey,
      state: closeState,
      imageMessageId: pendingImage.messageId,
      imageReceivedAt: pendingImage.receivedAt,
    });
  }

  setCloseState(stateKey, closeState);
  scheduleMissingImageReminder(stateKey, closeState.target);
  return null;
}

async function completeClose({ event, stateKey, state, imageMessageId, imageReceivedAt }) {
  clearReminderTimer(stateKey);

  if (state.employeeId && state.branchId) {
    const { data: attendance } = await supabase
      .from('attendance')
      .select('id,late_minutes')
      .eq('employee_id', state.employeeId)
      .eq('branch_id', state.branchId)
      .eq('work_date', state.workDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attendance) {
      const payload = {
        clock_out: state.clockOut,
        closed_early_minutes: state.closedEarlyBy,
        source: 'line',
        line_group_id: state.lineGroupId || null,
        line_user_id: state.lineUserId || null,
        message_text: state.messageText || null,
        submitted_at: state.submittedAt,
      };
      const { error } = await supabase.from('attendance').update(payload).eq('id', attendance.id);
      if (error) {
        if (!isMissingColumnError(error)) throw error;
        await supabase.from('attendance').update({
          clock_out: state.clockOut,
          late_minutes: attendance.late_minutes || 0,
        }).eq('id', attendance.id);
      }
    } else {
      const payload = {
        employee_id: state.employeeId,
        branch_id: state.branchId,
        work_date: state.workDate,
        clock_out: state.clockOut,
        closed_early_minutes: state.closedEarlyBy,
        source: 'line',
        line_group_id: state.lineGroupId || null,
        line_user_id: state.lineUserId || null,
        message_text: state.messageText || null,
        submitted_at: state.submittedAt,
      };
      const { error } = await supabase.from('attendance').insert([payload]);
      if (error) {
        if (!isMissingColumnError(error)) throw error;
        await supabase.from('attendance').insert([{
          employee_id: state.employeeId,
          branch_id: state.branchId,
          work_date: state.workDate,
          clock_out: state.clockOut,
        }]);
      }
    }

    if (state.closedEarlyBy > 0) {
      await ensureAttendanceAlert({
        alertType: 'closed_early',
        employeeId: state.employeeId,
        branchId: state.branchId,
        workDate: state.workDate,
        title: 'ปิดร้านก่อนเวลา',
        detail: `${state.actorName} ปิดร้านเวลา ${state.clockOut.slice(0, 5)} ก่อนเวลา ${state.closedEarlyBy} นาที (เวลาปิด ${state.expectedTime.slice(0, 5)})`,
        severity: 'warning',
        alertTime: state.clockOut,
      });
    }
  }

  const inspection = await upsertStoreInspectionClose({
    employeeId: state.employeeId,
    branchId: state.branchId,
    workDate: state.workDate,
    clockOut: state.clockOut,
    closedEarlyBy: state.closedEarlyBy,
    lineGroupId: state.lineGroupId,
    lineUserId: state.lineUserId,
    messageText: state.messageText,
    submittedAt: state.submittedAt,
    imageMessageId,
  });
  const attachment = inspection && inspection.id
    ? await uploadCloseAttachment({
      inspectionId: inspection.id,
      messageId: imageMessageId,
      inspectionItems: inspection.inspection_items,
    })
    : null;

  await createAbsenceAlertsForBranchDay({ branchId: state.branchId, workDate: state.workDate });

  await logEvent('close_shop_reported', {
    actor: state.employeeId || state.lineUserId,
    actorType: state.actorType,
    actorId: state.actorId,
    actorName: state.actorName,
    branch_id: state.branchId,
    branch_code: state.branchCode,
    reported_at: state.submittedAt,
    raw_text: state.messageText,
    inspection_id: inspection ? inspection.id : null,
    close_photo_url: attachment ? attachment.file_url : null,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [closeFlex({
      branchCode: state.branchCode,
      employeeName: state.actorName,
      time: `${state.workDate} ${state.clockOut.slice(0, 5)}`,
      expectedTime: state.expectedTime,
      closedEarlyBy: state.closedEarlyBy,
      messageId: imageMessageId,
      photoCount: 1,
      imageReceivedAt,
      attachmentUrl: attachment ? attachment.file_url : null,
    })],
  });

  clearCloseState(stateKey);
  return inspection;
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
  imageMessageId,
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
    close_shop_image: Boolean(imageMessageId),
    close_photo_message_id: imageMessageId || null,
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
    return { ...existing, inspection_items: inspectionItems };
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

async function uploadCloseAttachment({ inspectionId, messageId, inspectionItems }) {
  const contentResponse = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of contentResponse) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const fileName = `close_shop_${messageId}.jpg`;
  const storagePath = `close/${inspectionId}/${Date.now()}_${fileName}`;

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
    }])
    .select('*')
    .single();

  if (error) throw error;

  let photoCount = 1;
  try {
    const { count, error: countError } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'store_inspection')
      .eq('entity_id', inspectionId);

    if (!countError) photoCount = count || 1;
  } catch (err) {
    console.warn('Unable to count closing attachments:', err.message || err);
  }

  try {
    const items = inspectionItems && typeof inspectionItems === 'object' ? inspectionItems : {};
    await supabase
      .from('store_inspections')
      .update({
        inspection_items: {
          ...items,
          close_shop: true,
          close_shop_image: true,
          close_photo_message_id: messageId,
          close_photo_url: publicUrl,
        },
        photo_count: photoCount,
      })
      .eq('id', inspectionId);
  } catch (err) {
    console.warn('Unable to update closing photo metadata:', err.message || err);
  }

  return data;
}

async function handleImageMessage(event) {
  const source = event.source || {};
  const stateKey = getCloseStateKey(source);
  const messageId = event.message && event.message.id;

  if (!messageId) return false;

  const state = getCloseState(stateKey);
  if (!state || state.status !== CLOSE_STATUS.AWAITING_IMAGE) {
    setRecentCloseImage(stateKey, {
      messageId,
      receivedAt: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    });
    return false;
  }

  await completeClose({
    event,
    stateKey,
    state,
    imageMessageId: messageId,
    imageReceivedAt: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
  });
  return true;
}

function hasActiveCloseImageRequest(event) {
  return hasCloseState(getCloseStateKey(event.source || {}));
}

module.exports = {
  handle,
  handleImageMessage,
  hasActiveCloseImageRequest,
};
