const { lineClient } = require('../../backend/config/line');
const { supabase } = require('../../backend/config/supabase');
const { updateLeaveStatus } = require('./flows/leave/service');
const { updateSaleStatusWithTimestamp } = require('./flows/sales/service');
const { replyOrPush } = require('./reply');
const { logEvent } = require('./utils/audit');
const { approvedFlex, rejectedFlex } = require('./flex/salesFlex');
const employeeRepo = require('../../backend/repositories/employee.repo');

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
    employee = await employeeRepo.findByLineUserId(lineUserId);
    if (displayName === 'ผู้จัดการ' && employee && (employee.nickname || employee.name)) {
      displayName = employee.nickname || employee.name;
    }
  } catch (employeeError) {
    console.warn('Unable to fetch employee for approval actor:', lineUserId, employeeError.message || employeeError);
  }

  const confirmedByUsername = await fetchMatchingUsername(employee);
  return { lineUserId, displayName, confirmedByUsername };
}

async function handlePostback(event) {
  const data = event.postback && event.postback.data;
  if (!data) return null;

  const actor = event.source && event.source.userId ? event.source.userId : null;

  // leave_action|<id>|approve
  if (data.startsWith('leave_action|')) {
    const parts = data.split('|');
    const leaveId = parts[1];
    const action = parts[2];

    if (action === 'approve') {
      await updateLeaveStatus(leaveId, 'approved', actor);
      await logEvent('leave_approved', { leaveId, actor });
      await replyOrPush({ to: actor, messages: [{ type: 'text', text: `อนุมัติการลา ID: ${leaveId}` }] });
      return true;
    }

    if (action === 'reject') {
      await updateLeaveStatus(leaveId, 'rejected', actor);
      await logEvent('leave_rejected', { leaveId, actor });
      await replyOrPush({ to: actor, messages: [{ type: 'text', text: `ปฏิเสธการลา ID: ${leaveId}` }] });
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
