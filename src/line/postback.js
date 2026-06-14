const { lineClient } = require('../../backend/config/line');
const { supabase } = require('../../backend/config/supabase');
const { updateLeaveStatus } = require('./flows/leave/service');
const { updateSaleStatusWithTimestamp } = require('./flows/sales/service');
const { replyOrPush } = require('./reply');
const { logEvent } = require('./utils/audit');
const { approvedFlex, rejectedFlex } = require('./flex/salesFlex');
const leaveFlex = require('./flex/leaveFlex');
const { resolveLineActor } = require('./utils/actor');
const { fetchInspectionById, updateInspectionReview } = require('./flows/inspect/service');
const { inspectionPendingFlex, inspectionResultFlex } = require('./flex/inspectFlex');

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

  return new Date(dateValue).toLocaleString('th-TH', {
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
  let displayName = 'ผู้จัดการ';
  let actor = null;
  let employee = null;

  if (!lineUserId) {
    return { lineUserId, displayName, confirmedByUsername: null };
  }

  try {
    if (source.groupId) {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, lineUserId);
      if (profile && profile.displayName) displayName = profile.displayName;
    } else if (source.roomId) {
      const profile = await lineClient.getRoomMemberProfile(source.roomId, lineUserId);
      if (profile && profile.displayName) displayName = profile.displayName;
    } else {
      const profile = await lineClient.getProfile(lineUserId);
      if (profile && profile.displayName) displayName = profile.displayName;
    }
  } catch (profileError) {
    console.warn('Unable to fetch LINE profile for approval actor:', lineUserId, profileError.message || profileError);
  }

  try {
    actor = await resolveLineActor(lineUserId);
    employee = actor && actor.employee ? actor.employee : null;
    if (displayName === 'ผู้จัดการ' && actor && actor.name) {
      displayName = actor.name;
    }
  } catch (actorError) {
    console.warn('Unable to resolve approval actor:', lineUserId, actorError.message || actorError);
  }

  const confirmedByUsername = await fetchMatchingUsername(employee);
  return {
    lineUserId,
    displayName,
    confirmedByUsername: actor && actor.user ? actor.user.username : confirmedByUsername,
    actorType: actor && actor.user && actor.employeeResolvedBy === 'user_identity' ? 'user' : actor && actor.type,
    actorId: actor && actor.user && actor.employeeResolvedBy === 'user_identity' ? actor.user.id : actor && actor.id,
    name: actor && actor.name ? actor.name : displayName,
  };
}

function formatBangkokTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

async function resolveReviewActor(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  if (!lineUserId) return { actorType: 'line', actorId: null, name: 'ผู้จัดการ', username: null };

  let name = 'ผู้จัดการ';
  try {
    const actor = await resolveLineActor(lineUserId);
    if (actor && actor.type) {
      const actorType = actor.user && actor.employeeResolvedBy === 'user_identity' ? 'user' : actor.type;
      const actorId = actorType === 'user' && actor.user ? actor.user.id : actor.id;
      const username = actor.user ? actor.user.username : await fetchMatchingUsername(actor.employee);
      return {
        actorType,
        actorId,
        name: actor.name,
        username,
      };
    }
  } catch (err) {
    console.warn('Unable to resolve reviewing actor:', err.message || err);
  }

  try {
    if (source.groupId) {
      const profile = await lineClient.getGroupMemberProfile(source.groupId, lineUserId);
      if (profile && profile.displayName) name = profile.displayName;
    } else {
      const profile = await lineClient.getProfile(lineUserId);
      if (profile && profile.displayName) name = profile.displayName;
    }
  } catch (err) {
    console.warn('Unable to fetch reviewer profile:', err.message || err);
  }

  return {
    actorType: 'line',
    actorId: lineUserId,
    name,
    username: null,
  };
}

async function handlePostback(event) {
  const data = event.postback && event.postback.data;
  if (!data) return null;

  const actor = event.source && event.source.userId ? event.source.userId : null;

  // inspect_action|<inspectionId>|approve or problem
  if (data.startsWith('inspect_action|')) {
    const parts = data.split('|');
    const inspectionId = parts[1];
    const action = parts[2];
    const replyTarget = getReplyTarget(event);
    const inspection = await fetchInspectionById(inspectionId);

    if (!inspection) {
      await replyOrPush({ ...replyTarget, messages: [{ type: 'text', text: 'ไม่พบรายการตรวจร้านนี้' }] });
      return true;
    }

    const branchCode = inspection.branches ? inspection.branches.code : inspection.branch_id;
    const submitterName = inspection.employees
      ? (inspection.employees.nickname || inspection.employees.name)
      : (inspection.line_user_id || 'ไม่ระบุ');

    if (inspection.status === 'pass' || inspection.status === 'issue') {
      await replyOrPush({
        ...replyTarget,
        messages: [inspectionResultFlex({
          inspectionId,
          branchCode,
          status: inspection.status,
          reviewedBy: inspection.reviewed_by,
          reviewTime: inspection.review_time,
          managerNote: inspection.manager_note,
        })],
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
      reviewedBy: reviewer.username || reviewer.name,
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
      reviewed_by: reviewer.username || reviewer.name,
      status,
    });

    const resultFlex = inspectionResultFlex({
      inspectionId,
      branchCode,
      status,
      reviewedBy: reviewer.name,
      reviewTime,
      managerNote,
    });

    await replyOrPush({ ...replyTarget, messages: [resultFlex] });
    if (updated.employees && updated.employees.line_user_id) {
      await replyOrPush({ to: updated.employees.line_user_id, messages: [resultFlex] });
    }
    return true;
  }

  // leave_action|<id>|approve
  if (data.startsWith('leave_action|')) {
    const parts = data.split('|');
    const leaveId = parts[1];
    const action = parts[2];
    const reviewer = await resolveReviewActor(event);
    const decidedAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

    if (action === 'approve') {
      const leave = await updateLeaveStatus(leaveId, 'approved', actor, {
        decidedBy: reviewer.username || reviewer.name,
        editedBy: reviewer.username || reviewer.name,
        decidedAt,
        actorType: reviewer.actorType,
        actorId: reviewer.actorId,
        actorName: reviewer.name,
      });
      await logEvent('leave_approved', { leaveId, actor });
      const resultFlex = leaveFlex({
        id: leave.id,
        employeeName: leave.employees ? (leave.employees.nickname || leave.employees.name) : '-',
        branchCode: leave.branches ? leave.branches.code : '-',
        type: leave.leave_type,
        from: leave.start_date,
        to: leave.end_date,
        daysCount: leave.days_count,
        reason: leave.reason,
        status: 'approved',
        approvedBy: reviewer.name,
      });
      if (leave.employees && leave.employees.line_user_id) {
        await replyOrPush({ to: leave.employees.line_user_id, messages: [resultFlex] });
      }
      return true;
    }

    if (action === 'reject') {
      const leave = await updateLeaveStatus(leaveId, 'rejected', actor, {
        decidedBy: reviewer.username || reviewer.name,
        editedBy: reviewer.username || reviewer.name,
        decidedAt,
        actorType: reviewer.actorType,
        actorId: reviewer.actorId,
        actorName: reviewer.name,
      });
      await logEvent('leave_rejected', { leaveId, actor });
      const resultFlex = leaveFlex({
        id: leave.id,
        employeeName: leave.employees ? (leave.employees.nickname || leave.employees.name) : '-',
        branchCode: leave.branches ? leave.branches.code : '-',
        type: leave.leave_type,
        from: leave.start_date,
        to: leave.end_date,
        daysCount: leave.days_count,
        reason: leave.reason,
        status: 'rejected',
        approvedBy: reviewer.name,
      });
      if (leave.employees && leave.employees.line_user_id) {
        await replyOrPush({ to: leave.employees.line_user_id, messages: [resultFlex] });
      }
      return true;
    }
  }

  // sales_action|<saleId>|approve or reject
  if (data.startsWith('sales_action|')) {
    const parts = data.split('|');
    const saleId = parts[1];
    const action = parts[2];

    const sale = await fetchSaleById(saleId);
    const replyTarget = getReplyTarget(event);

    if (!sale) {
      await replyOrPush({
        ...replyTarget,
        messages: [{ type: 'text', text: 'ไม่พบรายการยอดขายนี้' }]
      });
      return true;
    }

    if (sale.status === 'approved') {
      const approvedBy = String(sale.confirmed_by || sale.approved_by || 'ผู้จัดการ');
      const approvedAt = formatThaiDateTime(sale.confirmed_at || sale.updated_at);

      await replyOrPush({
        ...replyTarget,
        messages: [
          approvedFlex({
            saleId,
            branchCode: getSaleBranchCode(sale),
            total: sale.total_amount || 0,
            approvedBy,
            approvedAt
          })
        ]
      });
      return true;
    }

    if (sale.status === 'rejected') {
      const rejectedBy = String(sale.confirmed_by || sale.rejected_by || 'ผู้จัดการ');
      const rejectedAt = formatThaiDateTime(sale.confirmed_at || sale.updated_at);

      await replyOrPush({
        ...replyTarget,
        messages: [
          rejectedFlex({
            saleId,
            branchCode: getSaleBranchCode(sale),
            rejectedBy,
            rejectedAt
          })
        ]
      });
      return true;
    }

    const actorInfo = await resolveApprovalActor(event);
    const actorName = actorInfo.displayName;
    const timestamp = formatThaiDateTime(new Date());
    const branchCode = getSaleBranchCode(sale);
    const total = sale.total_amount || 0;

    if (action === 'approve') {
      await updateSaleStatusWithTimestamp(saleId, 'approved', {
        confirmedByUsername: actorInfo.confirmedByUsername,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        actorName: actorInfo.name,
      });
      await logEvent('sales_approved_by_manager', {
        sale_id: saleId,
        actor,
        approved_by: actorName,
        confirmed_by: actorInfo.confirmedByUsername || null,
      });
      await replyOrPush({
        ...replyTarget,
        messages: [
          approvedFlex({
            saleId,
            branchCode,
            total,
            approvedBy: actorName,
            approvedAt: timestamp
          })
        ]
      });
      return true;
    }

    if (action === 'reject') {
      await updateSaleStatusWithTimestamp(saleId, 'rejected', {
        confirmedByUsername: actorInfo.confirmedByUsername,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        actorName: actorInfo.name,
      });
      await logEvent('sales_rejected_by_manager', {
        sale_id: saleId,
        actor,
        rejected_by: actorName,
        confirmed_by: actorInfo.confirmedByUsername || null,
      });
      await replyOrPush({
        ...replyTarget,
        messages: [
          rejectedFlex({
            saleId,
            branchCode,
            rejectedBy: actorName,
            rejectedAt: timestamp
          })
        ]
      });
      return true;
    }
  }

  return null;
}

module.exports = { handlePostback };
