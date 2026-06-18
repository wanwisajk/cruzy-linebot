const { lineClient } = require('../../backend/config/line');
const { supabase } = require('../../backend/config/supabase');
const { updateLeaveStatus } = require('./flows/leave/service');
const { updateSaleStatusWithTimestamp } = require('./flows/sales/service');
const { replyOrPush } = require('./reply');
const { logEvent } = require('./utils/audit');
const depositFlex = require('./flex/depositFlex');
const { resolveLineActor } = require('./utils/actor');
const { fetchInspectionById, updateInspectionReview } = require('./flows/inspect/service');
const { inspectionPendingFlex } = require('./flex/inspectFlex');
const { getDepositState, setDepositState, DEPOSIT_STATUS } = require('./flows/deposit/state');
const { recordDeposit, saveDepositSlipAttachments } = require('./flows/deposit/service');
const { getDisplayName } = require('./utils/displayName');

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const TH_GREGORY_LOCALE = 'th-TH-u-ca-gregory-nu-latn';

async function fetchSaleById(saleId) {
  const { data, error } = await supabase
    .from('sales')
    .select('*,branches(code,name)')
    .eq('id', saleId)
    .single();
  if (error) throw error;
  return data;
}

function getReplyTarget(event) {
  if (event.replyToken) {
    return { replyToken: event.replyToken };
  }

  if (event.source && event.source.groupId) {
    return { to: event.source.groupId };
  }

  if (event.source && event.source.roomId) {
    return { to: event.source.roomId };
  }

  if (event.source && event.source.userId) {
    return { to: event.source.userId };
  }

  throw new Error('No valid reply target available');
}

function formatThaiDateTime(dateValue) {
  if (!dateValue) return 'ไม่ระบุเวลา';

  return new Date(dateValue).toLocaleString(TH_GREGORY_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getSaleBranchCode(sale) {
  return String(
    (sale.branches && (sale.branches.code || sale.branches.name)) ||
    sale.branch_code ||
    sale.branch_id ||
    'ไม่ระบุสาขา'
  );
}

async function fetchMatchingUsername(employee) {
  if (!employee) return null;

  const candidates = [
    { column: 'name', value: employee.name },
    { column: 'name', value: employee.nickname },
    { column: 'username', value: employee.name },
    { column: 'username', value: employee.nickname },
    { column: 'username', value: String(employee.id) },
  ].filter((item) => item.value);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq(candidate.column, candidate.value)
      .maybeSingle();

    if (error) {
      console.warn('Unable to resolve approving user:', error.message || error);
      continue;
    }

    if (data && data.username) return data.username;
  }

  return null;
}

async function resolveApprovalActor(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  let profileName = null;
  let actor = null;
  let employee = null;

  if (!lineUserId) {
    return { lineUserId, displayName: '-', confirmedByUsername: null };
  }

  try {
    if (source.groupId) {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, lineUserId);
      if (profile && profile.displayName) profileName = profile.displayName;
    } else if (source.roomId) {
      const profile = await lineClient.getRoomMemberProfile(source.roomId, lineUserId);
      if (profile && profile.displayName) profileName = profile.displayName;
    } else {
      const profile = await lineClient.getProfile(lineUserId);
      if (profile && profile.displayName) profileName = profile.displayName;
    }
  } catch (profileError) {
    console.warn('Unable to fetch LINE profile for approval actor:', lineUserId, profileError.message || profileError);
  }

  try {
    actor = await resolveLineActor(lineUserId);
    employee = actor && actor.employee ? actor.employee : null;
  } catch (actorError) {
    console.warn('Unable to resolve approval actor:', lineUserId, actorError.message || actorError);
  }

  const confirmedByUsername = await fetchMatchingUsername(employee);
  const displayName = getDisplayName(employee, actor && actor.user, profileName, lineUserId);
  return {
    lineUserId,
    displayName,
    confirmedByUsername: actor && actor.user ? actor.user.username : confirmedByUsername,
    actorType: actor && actor.user && actor.employeeResolvedBy === 'user_identity' ? 'user' : actor && actor.type,
    actorId: actor && actor.user && actor.employeeResolvedBy === 'user_identity' ? actor.user.id : actor && actor.id,
    name: displayName,
  };
}

function formatBangkokTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return date.toLocaleTimeString('en-GB', {
    timeZone: BANGKOK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getLegacyDepositSlipUrls(pendingState) {
  if (!pendingState) return [];
  if (Array.isArray(pendingState.slipUrls) && pendingState.slipUrls.length > 0) {
    return pendingState.slipUrls.filter(Boolean);
  }
  return pendingState.slipUrl ? [pendingState.slipUrl] : [];
}

async function savePendingDepositSlips(deposit, pendingState) {
  if (!deposit || !deposit.id || !pendingState) {
    return { slipUrls: [], slipCount: 0 };
  }

  const slipMessageIds = Array.isArray(pendingState.slipMessageIds)
    ? pendingState.slipMessageIds
    : [];
  const attachments = await saveDepositSlipAttachments({
    depositId: deposit.id,
    messageIds: slipMessageIds,
  });
  const attachmentUrls = attachments
    .map((attachment) => attachment && attachment.file_url)
    .filter(Boolean);
  const slipUrls = attachmentUrls.length > 0
    ? attachmentUrls
    : getLegacyDepositSlipUrls(pendingState);

  return {
    slipUrls,
    slipCount: slipUrls.length || slipMessageIds.length,
  };
}

async function resolveReviewActor(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  if (!lineUserId) return { actorType: 'line', actorId: null, name: '-', username: null };

  let profileName = null;
  try {
    const actor = await resolveLineActor(lineUserId);
    if (actor && actor.type) {
      const actorType = actor.user && actor.employeeResolvedBy === 'user_identity' ? 'user' : actor.type;
      const actorId = actorType === 'user' && actor.user ? actor.user.id : actor.id;
      const username = actor.user ? actor.user.username : await fetchMatchingUsername(actor.employee);
      return {
        actorType,
        actorId,
        name: getDisplayName(actor.employee, actor.user, actor.name, lineUserId),
        username,
      };
    }
  } catch (err) {
    console.warn('Unable to resolve reviewing actor:', err.message || err);
  }

  try {
    if (source.groupId) {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, lineUserId);
      if (profile && profile.displayName) profileName = profile.displayName;
    } else {
      const profile = await lineClient.getProfile(lineUserId);
      if (profile && profile.displayName) profileName = profile.displayName;
    }
  } catch (err) {
    console.warn('Unable to fetch reviewer profile:', err.message || err);
  }

  return {
    actorType: 'line',
    actorId: lineUserId,
    name: getDisplayName(profileName, lineUserId),
    username: null,
  };
}

async function handlePostback(event) {
  const data = event.postback && event.postback.data;
  if (!data) return null;

  const normalizedData = String(data).trim();

  const actor = event.source && event.source.userId ? event.source.userId : null;

  // inspect_action|<inspectionId>|approve or problem
  if (normalizedData.startsWith('inspect_action|')) {
    const parts = normalizedData.split('|');
    const inspectionId = parts[1];
    const action = String(parts[2] || '').trim().toLowerCase();
    const replyTarget = getReplyTarget(event);
    const inspection = await fetchInspectionById(inspectionId);

    if (!inspection) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'ไม่พบรายการตรวจร้านนี้' }] });
      return true;
    }

    const branchCode = inspection.branches ? inspection.branches.code : inspection.branch_id;
    const submitterName = getDisplayName(inspection.employees, inspection.line_user_id);

    if (inspection.status === 'pass' || inspection.status === 'issue') {
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: 'รายการนี้บันทึกผลแล้ว ระบบจะส่งแจ้งผลในกลุ่มอัตโนมัติ' }],
      });
      return true;
    }

    if (action !== 'approve' && action !== 'problem') {
      await replyOrPush({
        ...replyTarget,
        messages: [inspectionPendingFlex({
          inspectionId,
          branchCode,
          submitterName,
          photoCount: inspection.photo_count,
          workDate: inspection.work_date,
          submitTime: inspection.submit_time,
        })],
      });
      return true;
    }

    const reviewer = await resolveReviewActor(event);
    const status = action === 'approve' ? 'pass' : 'issue';
    const managerNote = action === 'approve' ? 'อนุมัติการตรวจร้าน' : 'ตรวจร้านมีปัญหา';
    const reviewTime = formatBangkokTime(event.timestamp);
    const updated = await updateInspectionReview({
      inspectionId,
      status,
      reviewedBy: getDisplayName(reviewer.name, reviewer.username),
      reviewTime,
      managerNote,
      actorType: reviewer.actorType,
      actorId: reviewer.actorId,
    });

    await logEvent(action === 'approve' ? 'inspection_approved' : 'inspection_marked_problem', {
      table_name: 'store_inspections',
      record_id: inspectionId,
      branch_id: updated.branch_id,
      actor,
      actor_name: reviewer.name,
      reviewed_by: getDisplayName(reviewer.name, reviewer.username),
      status,
    });

    await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'บันทึกผลตรวจร้านแล้ว ระบบจะส่งแจ้งผลในกลุ่มอัตโนมัติ' }] });
    return true;
  }

  // leave_action|<id>|approve
  if (normalizedData.startsWith('leave_action|')) {
    const parts = normalizedData.split('|');
    const leaveId = parts[1];
    const action = String(parts[2] || '').trim().toLowerCase();
    const reviewer = await resolveReviewActor(event);
    const decidedAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

    if (action === 'approve') {
      await updateLeaveStatus(leaveId, 'approved', actor, {
        decidedBy: getDisplayName(reviewer.name, reviewer.username),
        editedBy: getDisplayName(reviewer.name, reviewer.username),
        decidedAt,
        actorType: reviewer.actorType,
        actorId: reviewer.actorId,
        actorName: reviewer.name,
      });
      await logEvent('leave_approved', { leaveId, actor });
      await replyOrPush({ ...getReplyTarget(event), messages: [{ type: 'text', text: 'บันทึกอนุมัติวันลาแล้ว ระบบจะส่งแจ้งผลอัตโนมัติ' }] });
      return true;
    }

    if (action === 'reject') {
      await updateLeaveStatus(leaveId, 'rejected', actor, {
        decidedBy: getDisplayName(reviewer.name, reviewer.username),
        editedBy: getDisplayName(reviewer.name, reviewer.username),
        decidedAt,
        actorType: reviewer.actorType,
        actorId: reviewer.actorId,
        actorName: reviewer.name,
      });
      await logEvent('leave_rejected', { leaveId, actor });
      await replyOrPush({ ...getReplyTarget(event), messages: [{ type: 'text', text: 'บันทึกไม่อนุมัติวันลาแล้ว ระบบจะส่งแจ้งผลอัตโนมัติ' }] });
      return true;
    }
  }

  // sales_action|<saleId>|approve or reject
  // deposit_action|<depositId>|approve or reject
  if (normalizedData.startsWith('deposit_draft|')) {
    const parts = normalizedData.split('|');
    const action = String(parts[2] || '').trim().toLowerCase();
    const replyTarget = getReplyTarget(event);
    const source = event.source || {};
    const actor = source.userId || null;
    const pendingState = actor ? getDepositState(actor) : null;

    if (!pendingState || pendingState.status !== DEPOSIT_STATUS.AWAITING_CONFIRMATION) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'ไม่พบข้อมูลสรุปฝากเงินที่รอส่งอยู่ครับ กรุณาเริ่มใหม่' }] });
      return true;
    }

    if (action === 'cancel') {
      setDepositState(actor, null);
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'ยกเลิกรายการฝากเงินแล้วครับ' }] });
      return true;
    }

    if (action === 'edit') {
      setDepositState(actor, null);
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'แก้ไขข้อมูลได้เลยครับ พิมพ์ยอดฝากใหม่อีกครั้ง' }] });
      return true;
    }

    if (action !== 'send') {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'คำสั่งไม่ถูกต้อง' }] });
      return true;
    }

    const created = await recordDeposit({
      deposit_date: pendingState.depositDate,
      branch_id: pendingState.branchId,
      deposited_by: pendingState.employeeId,
      deposited_amount: pendingState.amount,
      bank: pendingState.bank || null,
      bank_short: pendingState.bankShort || null,
      bank_account_id: pendingState.bankAccountId || null,
      slip_url: getLegacyDepositSlipUrls(pendingState)[0] || null,
      source: 'line',
      line_group_id: pendingState.lineGroupId,
      line_user_id: pendingState.lineUserId,
      message_text: pendingState.messageText,
      submitted_at: pendingState.submittedAt,
    });

    await logEvent('deposit_recorded', {
      deposit: created,
      actorType: pendingState.actorType || (pendingState.employeeId ? 'employee' : 'line'),
      actorId: pendingState.actorId || pendingState.employeeId || null,
    });

    const savedSlips = await savePendingDepositSlips(created, pendingState);

    setDepositState(actor, null);

    if (created.__duplicate) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'รายการฝากเงินของสาขา/วันนี้มีอยู่แล้ว ใช้รายการเดิมต่อครับ' }] });
      return true;
    }

    if (created && created.line_group_id) {
      try {
        const managerFlex = depositFlex.managerApprovalFlex({
          depositId: created.id,
          branchCode: created.branches ? (created.branches.code || created.branches.name) : pendingState.branchCode,
          depositDate: created.deposit_date,
          amount: created.deposited_amount,
          bankShort: pendingState.bankShort || null,
          bankName: pendingState.bank || null,
          accountName: pendingState.bankAccountName || null,
          accountNo: pendingState.bankAccountNo || null,
          slipCount: savedSlips.slipCount,
          slipUrls: savedSlips.slipUrls,
          submittedAt: pendingState.submittedAt,
          lineUserId: pendingState.lineUserId,
          messageText: pendingState.messageText,
          source: pendingState.source || 'line',
          depositedBy: pendingState.employeeName,
        });
        await replyOrPush({ to: created.line_group_id, messages: [managerFlex] });
      } catch (err) {
        console.warn('Failed to send manager approval flex for deposit:', err.message || err, { depositId: created && created.id });
      }
    }
    return true;
  }

  if (normalizedData.startsWith('deposit_action|')) {
    const parts = normalizedData.split('|');
    const depositId = parts[1];
    const action = String(parts[2] || '').trim().toLowerCase();
    const replyTarget = getReplyTarget(event);
    const source = event.source || {};
    const actor = source.userId || null;

    const pendingState = actor ? getDepositState(actor) : null;
    if (pendingState && pendingState.status === DEPOSIT_STATUS.AWAITING_CONFIRMATION && (action === 'send' || action === 'edit')) {
      if (action === 'edit') {
        setDepositState(actor, null);
        await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'แก้ไขข้อมูลได้เลยครับ พิมพ์ยอดฝากใหม่อีกครั้ง' }] });
        return true;
      }

      const created = await recordDeposit({
        deposit_date: pendingState.depositDate,
        branch_id: pendingState.branchId,
        deposited_by: pendingState.employeeId,
        deposited_amount: pendingState.amount,
        bank: pendingState.bank || null,
        bank_short: pendingState.bankShort || null,
        bank_account_id: pendingState.bankAccountId || null,
        slip_url: getLegacyDepositSlipUrls(pendingState)[0] || null,
        source: 'line',
        line_group_id: pendingState.lineGroupId,
        line_user_id: pendingState.lineUserId,
        message_text: pendingState.messageText,
        submitted_at: pendingState.submittedAt,
      });

      await logEvent('deposit_recorded', {
        deposit: created,
        actorType: pendingState.actorType || (pendingState.employeeId ? 'employee' : 'line'),
        actorId: pendingState.actorId || pendingState.employeeId || null,
      });
      const savedSlips = await savePendingDepositSlips(created, pendingState);
      setDepositState(actor, null);

      if (created && created.line_group_id) {
        try {
          const managerFlex = depositFlex.managerApprovalFlex({
            depositId: created.id,
            branchCode: created.branches ? (created.branches.code || created.branches.name) : pendingState.branchCode,
            depositDate: created.deposit_date,
            amount: created.deposited_amount,
            bankShort: pendingState.bankShort || null,
            bankName: pendingState.bank || null,
            accountName: pendingState.bankAccountName || null,
            accountNo: pendingState.bankAccountNo || null,
            slipCount: savedSlips.slipCount,
            slipUrls: savedSlips.slipUrls,
            submittedAt: pendingState.submittedAt,
            lineUserId: pendingState.lineUserId,
            messageText: pendingState.messageText,
            source: pendingState.source || 'line',
            depositedBy: pendingState.employeeName,
          });
          await replyOrPush({ to: created.line_group_id, messages: [managerFlex] });
        } catch (err) {
          console.warn('Failed to send manager approval flex for deposit:', err.message || err, { depositId: created && created.id });
        }
      }
      return true;
    }

    if (pendingState && pendingState.status === DEPOSIT_STATUS.AWAITING_CONFIRMATION) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'กรุณากด "ยืนยันและส่ง" หรือ "แก้ไขข้อมูล" ในหน้าสรุปก่อนครับ' }] });
      return true;
    }

    const { data: deposit, error: fetchError } = await supabase
      .from('cash_deposits')
      .select('*,branches(code,name),bank_accounts(bank_name,bank_short,account_name,account_no),employees(name,nickname,line_user_id)')
      .eq('id', depositId)
      .maybeSingle();

    if (fetchError || !deposit) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'ไม่พบรายการฝากเงินนี้' }] });
      return true;
    }

    if (deposit.status === 'verified') {
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: 'รายการนี้อนุมัติไปแล้ว' }],
      });
      return true;
    }

    const actorInfo = await resolveApprovalActor(event);
    const actorName = actorInfo.displayName;

    if (action === 'approve') {
      const payload = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: actorInfo.confirmedByUsername || null,
        updated_at: new Date().toISOString(),
        line_notified: false,
      };

      const { data: updated, error: updateError } = await supabase.from('cash_deposits').update(payload).eq('id', depositId).select('*').maybeSingle();
      if (updateError) {
        console.warn('Failed to update deposit status:', updateError.message || updateError, { depositId });
        await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'เกิดข้อผิดพลาดในการบันทึกสถานะ กรุณาลองใหม่' }] });
        return true;
      }

      await logEvent('deposit_verified_by_manager', { deposit_id: depositId, actor, verified_by: actorName, confirmed_by: actorInfo.confirmedByUsername || null });
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: 'บันทึกอนุมัติยอดฝากแล้ว ระบบจะส่งแจ้งผลอัตโนมัติ' }],
      });
      return true;
    }

    if (action === 'reject') {
      const payload = {
        status: 'rejected',
        verified_at: new Date().toISOString(),
        verified_by: actorInfo.confirmedByUsername || null,
        updated_at: new Date().toISOString(),
        line_notified: false,
      };
      const { data: updated, error: updateError } = await supabase.from('cash_deposits').update(payload).eq('id', depositId).select('*').maybeSingle();
      if (updateError) {
        console.warn('Failed to update deposit status (reject):', updateError.message || updateError, { depositId });
        await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'เกิดข้อผิดพลาดในการบันทึกสถานะ กรุณาลองใหม่' }] });
        return true;
      }

      await logEvent('deposit_rejected_by_manager', { deposit_id: depositId, actor, rejected_by: actorName, confirmed_by: actorInfo.confirmedByUsername || null });
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: `รายการฝากเงิน #${updated.id} ถูกตีกลับแล้ว` }],
      });
      return true;
    }
  }

  if (normalizedData.startsWith('sales_action|')) {
    const parts = normalizedData.split('|');
    const saleId = parts[1];
    const action = String(parts[2] || '').trim().toLowerCase();

    const sale = await fetchSaleById(saleId);
    const replyTarget = getReplyTarget(event);

    if (!sale) {
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: 'ไม่พบรายการยอดขายนี้' }]
      });
      return true;
    }

    if (sale.status === 'confirmed') {
      const approvedBy = String(sale.confirmed_by || sale.approved_by || 'ผู้จัดการ');
      const approvedAt = formatThaiDateTime(sale.confirmed_at || sale.updated_at);
      const messages = [{ type: 'text', text: 'รายการนี้อนุมัติไปแล้ว' }];

      await replyOrPush({
        ...replyTarget,
        messages,
      });

      return true;
    }

    if (sale.status === 'rejected') {
      const rejectedBy = String(sale.confirmed_by || sale.rejected_by || 'ผู้จัดการ');
      const rejectedAt = formatThaiDateTime(sale.confirmed_at || sale.updated_at);
      const messages = [{ type: 'text', text: 'รายการนี้ถูกตีกลับไปแล้ว' }];

      await replyOrPush({
        ...replyTarget,
        messages,
      });

      return true;
    }

    const actorInfo = await resolveApprovalActor(event);
    const actorName = actorInfo.displayName;
    if (action === 'approve') {
      await updateSaleStatusWithTimestamp(saleId, 'confirmed', {
        confirmedByUsername: actorInfo.confirmedByUsername,
        lineNotified: false,
      });
      await logEvent('sales_approved_by_manager', {
        sale_id: saleId,
        actor,
        approved_by: actorName,
        confirmed_by: actorInfo.confirmedByUsername || null,
      });
      return true;
    }

    if (action === 'reject') {
      await updateSaleStatusWithTimestamp(saleId, 'rejected', {
        confirmedByUsername: actorInfo.confirmedByUsername,
        lineNotified: false,
      });
      await logEvent('sales_rejected_by_manager', {
        sale_id: saleId,
        actor,
        rejected_by: actorName,
        confirmed_by: actorInfo.confirmedByUsername || null,
      });
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: `รายการยอดขาย #${saleId} ถูกตีกลับแล้ว` }] });
      return true;
    }

    await replyOrPush({
      ...replyTarget,
      messages: [{ type: 'text', text: 'ไม่รู้จักคำสั่งอนุมัติยอดขายนี้ กรุณาลองกดปุ่มอีกครั้ง' }]
    });
    return true;
  }

  return null;
}

module.exports = { handlePostback };
