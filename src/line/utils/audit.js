const { supabase } = require('../../../backend/config/supabase');
const employeeRepo = require('../../../backend/repositories/employee.repo');
const userRepo = require('../../../backend/repositories/user.repo');
const { resolveBranchFromEvent } = require('./context');
const { getDisplayName } = require('./displayName');

async function logEvent(eventType, payload) {
  try {
    await supabase.from('system_audit_logs').insert([{
      user_name: payload && (payload.user_name || payload.actor_name) || 'line_bot',
      action: eventType,
      table_name: payload && payload.table_name || 'line_events',
      record_id: payload && (payload.record_id || payload.id || payload.sale_id || payload.leaveId) ? String(payload.record_id || payload.id || payload.sale_id || payload.leaveId) : null,
      source: 'line',
      description: eventType,
      new_value: payload || {},
      branch_id: payload && payload.branch_id || null,
      actor_type: 'line',
      actor_id: payload && (payload.actor || payload.actor_id) ? String(payload.actor || payload.actor_id) : null,
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    // swallow; auditing should not break main flow
    console.warn('Audit log failed', err.message || err);
  }
}

async function logInboundLineEvent(event) {
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const text = event.message && event.message.type === 'text'
    ? event.message.text
    : event.postback && event.postback.data
      ? event.postback.data
      : event.message && event.message.id
        ? `${event.message.type}:${event.message.id}`
        : event.type;
  const submittedAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const context = await safeResolveBranch(event, text);
  const employee = lineUserId ? await safeLookup(() => employeeRepo.findByLineUserId(lineUserId), 'employee') : null;
  const admin = lineUserId ? await safeLookup(() => userRepo.findByLineUserId(lineUserId), 'user') : null;
  const actorName = getDisplayName(employee, admin, lineUserId, 'unknown_line_user');
  const payload = {
    event_type: event.type,
    message_type: event.message && event.message.type || null,
    text,
    line_user_id: lineUserId,
    line_group_id: source.groupId || null,
    line_room_id: source.roomId || null,
    reply_token: event.replyToken || null,
    submitted_at: submittedAt,
    branch_id: context.branch ? context.branch.id : null,
    branch_code: context.branch ? context.branch.code : null,
    actor_employee_id: employee ? employee.id : null,
    actor_user_id: admin ? admin.id : null,
    actor_name: actorName,
  };

  try {
    await supabase.from('system_audit_logs').insert([{
      user_name: actorName,
      action: 'line_inbound_event',
      table_name: 'line_events',
      record_id: event.webhookEventId || null,
      source: 'line',
      description: text || event.type,
      new_value: payload,
      branch_id: context.branch ? context.branch.id : null,
      actor_type: employee ? 'employee' : admin ? 'user' : 'line',
      actor_id: employee ? String(employee.id) : admin ? String(admin.id) : lineUserId,
      created_at: submittedAt,
    }]);
  } catch (err) {
    console.warn('Inbound LINE audit insert failed', err.message || err, payload);
  }
}

async function safeResolveBranch(event, text) {
  try {
    return await resolveBranchFromEvent(event, text);
  } catch (err) {
    console.warn('Inbound LINE branch lookup failed', err.message || err);
    return { branch: null, lineGroupId: event.source && event.source.groupId || null, matchedBy: null };
  }
}

async function safeLookup(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`Inbound LINE ${label} lookup failed`, err.message || err);
    return null;
  }
}

module.exports = { logEvent, logInboundLineEvent };
