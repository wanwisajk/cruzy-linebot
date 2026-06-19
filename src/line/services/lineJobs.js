const { supabase } = require('../../../backend/config/supabase');
const { lineClient } = require('../../../backend/config/line');
const warningFlex = require('../flex/warningFlex');
const payrollFlex = require('../flex/payrollFlex');
const alertFlex = require('../flex/alertFlex');
const leaveFlex = require('../flex/leaveFlex');
const { approvedSalesResultFlex } = require('../flex/salesFlex');
const depositFlex = require('../flex/depositFlex');
const { inspectionPendingFlex, inspectionResultFlex } = require('../flex/inspectFlex');
const { getDisplayName } = require('../utils/displayName');
const userRepo = require('../../../backend/repositories/user.repo');

let running = false;
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const TH_GREGORY_LOCALE = 'th-TH-u-ca-gregory-nu-latn';
const DEFAULT_INSPECTION_LIFF_URL = 'https://liff.line.me/2010334830-E2aZbMzY';

function inspectionLiffBaseUrl() {
  const raw = String(process.env.LIFF_INSPECTION_URL || DEFAULT_INSPECTION_LIFF_URL).trim().replace(/\/+$/, '');
  if (/^\d+-[A-Za-z0-9_-]+$/.test(raw)) return `https://liff.line.me/${raw}`;
  if (/^liff\.line\.me\//i.test(raw)) return `https://${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return DEFAULT_INSPECTION_LIFF_URL;
}

function buildInspectionDetailUrl(inspection) {
  const baseUrl = inspectionLiffBaseUrl();
  if (!baseUrl || !inspection) return null;
  const path = baseUrl.includes('liff.line.me/') || baseUrl.endsWith('/liff/inspection')
    ? baseUrl
    : `${baseUrl}/liff/inspection`;
  const query = new URLSearchParams({
    branchId: String(inspection.branch_id),
    date: String(inspection.work_date),
    inspectionId: String(inspection.id),
  });
  if (inspection.submitted_by) query.set('employeeId', String(inspection.submitted_by));
  if (inspection.line_user_id) query.set('lineUserId', String(inspection.line_user_id));
  if (inspection.branches && inspection.branches.code) query.set('branchCode', String(inspection.branches.code));
  return `${path}?${query.toString()}`;
}

function bangkokDateParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
  };
}

function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const parts = bangkokDateParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function monthStart(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const parts = bangkokDateParts(date);
  return `${parts.year}-${pad(parts.month)}-01`;
}

function isLastDayOfMonth(date = new Date()) {
  const parts = bangkokDateParts(date);
  const bangkokNoonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  bangkokNoonUtc.setUTCDate(bangkokNoonUtc.getUTCDate() + 1);
  return bangkokDateParts(bangkokNoonUtc).day === 1;
}

async function push(to, message) {
  return lineClient.pushMessage({ to, messages: [message] });
}

function getLineErrorDetail(error) {
  const responseData =
    error && error.response && error.response.data ||
    error && error.originalError && error.originalError.response && error.originalError.response.data ||
    error && error.body;

  return {
    message: error && error.message,
    statusCode: error && (error.statusCode || error.status),
    response: responseData || null,
    details: error && error.details || null,
  };
}

async function countAttachments(entityType, entityId) {
  if (!entityType || !entityId) return 0;

  const { count, error } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (error) {
    console.warn('Attachment count query failed:', error.message || error, { entityType, entityId });
    return 0;
  }

  return count || 0;
}

async function fetchWarningLettersByIssueDate(today) {
  const { data, error } = await supabase
    .from('warning_letters')
    .select('id,level,issue_date,reason,status,is_signed_by_emp,employees(name,nickname,line_user_id)')
    .eq('issue_date', today)
    .is('line_sent_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Warning letter LINE job issue_date query failed:', error.message || error);
    return [];
  }

  return data || [];
}

async function fetchWarningLettersCreatedToday(today, tomorrow) {
  const { data, error } = await supabase
    .from('warning_letters')
    .select('id,level,issue_date,reason,status,is_signed_by_emp,employees(name,nickname,line_user_id)')
    .gte('created_at', `${today}T00:00:00`)
    .lt('created_at', `${tomorrow}T00:00:00`)
    .is('line_sent_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Warning letter LINE job created_at query failed:', error.message || error);
    return [];
  }

  return data || [];
}

async function sendTodayWarningLetters(date = new Date()) {
  const today = localDateString(date);
  const tomorrowDate = new Date(date);
  tomorrowDate.setDate(date.getDate() + 1);
  const tomorrow = localDateString(tomorrowDate);
  const byIssueDate = await fetchWarningLettersByIssueDate(today);
  const byCreatedAt = await fetchWarningLettersCreatedToday(today, tomorrow);
  const warningsById = new Map();

  for (const warning of [...byIssueDate, ...byCreatedAt]) {
    warningsById.set(warning.id, warning);
  }

  for (const warning of warningsById.values()) {
    const lineUserId = warning.employees && warning.employees.line_user_id;
    if (!lineUserId) {
      console.warn('Skip warning letter LINE push: employee has no line_user_id', { warning_id: warning.id });
      continue;
    }

    await push(lineUserId, warningFlex({
      id: warning.id,
      employeeName: getDisplayName(warning.employees),
      level: warning.level,
      issueDate: warning.issue_date,
      note: warning.reason,
      status: warning.status,
      signed: warning.is_signed_by_emp,
    }));

    await supabase
      .from('warning_letters')
      .update({
        line_sent_at: new Date().toISOString(),
        line_user_id: lineUserId,
        source: 'line',
      })
      .eq('id', warning.id);
  }
}

const sendPendingWarningLetters = sendTodayWarningLetters;

async function sendTodayAttendanceAlerts(date = new Date()) {
  const today = localDateString(date);

  const { data, error } = await supabase
    .from('attendance_alerts')
    .select('id,alert_type,work_date,title,detail,severity,alert_time,branches(code,name),employees(name,nickname,line_user_id)')
    .eq('work_date', today)
    .eq('is_acknowledged', false);

  if (error) {
    console.warn('Attendance alert LINE job query failed:', error.message || error);
    return;
  }

  for (const alert of data || []) {
    const lineUserId = alert.employees && alert.employees.line_user_id;
    if (!lineUserId) continue;

    const { data: claimed, error: claimError } = await supabase
      .from('attendance_alerts')
      .update({ is_acknowledged: true })
      .eq('id', alert.id)
      .eq('is_acknowledged', false)
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      if (claimError) console.warn('Attendance alert claim failed:', claimError.message || claimError, { alert_id: alert.id });
      continue;
    }

    try {
      await push(lineUserId, alertFlex({
        title: alert.title || 'แจ้งเตือนการเข้างานวันนี้',
        body: [
          `พนักงาน: ${getDisplayName(alert.employees)}`,
          `วันที่: ${alert.work_date}`,
          `สาขา: ${alert.branches ? alert.branches.code : '-'}`,
          alert.alert_time ? `เวลา: ${String(alert.alert_time).slice(0, 5)}` : null,
          alert.detail,
        ].filter(Boolean).join('\n'),
        severity: alert.severity,
      }));
    } catch (sendError) {
      await supabase
        .from('attendance_alerts')
        .update({ is_acknowledged: false })
        .eq('id', alert.id);
      console.warn('Attendance alert LINE push failed:', getLineErrorDetail(sendError), { alert_id: alert.id, lineUserId });
    }
  }
}

async function sendMonthEndPayroll(date = new Date()) {
  if (!isLastDayOfMonth(date)) return;

  const salaryMonth = monthStart(date);
  const { data, error } = await supabase
    .from('salary_summaries')
    .select('id,salary_month,gross_amount,deduction_amount,net_amount,line_sent_at,employees(name,nickname,line_user_id)')
    .eq('salary_month', salaryMonth)
    .is('line_sent_at', null);

  if (error || !data || data.length === 0) return;

  for (const summary of data) {
    const lineUserId = summary.employees && summary.employees.line_user_id;
    if (!lineUserId) continue;

    await push(lineUserId, payrollFlex({
      employeeName: getDisplayName(summary.employees),
      gross: summary.gross_amount,
      allowance: 0,
      deductions: summary.deduction_amount,
      net: summary.net_amount,
      payCycle: 'monthly',
    }));

    await supabase
      .from('salary_summaries')
      .update({ line_sent_at: new Date().toISOString() })
      .eq('id', summary.id);
  }
}

async function sendLeaveResults() {
  const { data, error } = await supabase
    .from('leaves')
    .select('id,leave_type,start_date,end_date,status,line_user_id,decided_by,audit_actor_name,employees(name,nickname,line_user_id)')
    .in('status', ['approved', 'rejected'])
    .or('line_notified.eq.false,line_notified.is.null')
    .order('updated_at', { ascending: true });

  if (error) {
    console.warn('Leave notification job query failed:', error.message || error);
    return;
  }

  for (const leave of data || []) {
    const lineUserId = (leave.employees && leave.employees.line_user_id) || leave.line_user_id;
    if (!lineUserId) {
      console.warn('Skip leave notification: missing line_user_id', { leave_id: leave.id });
      continue;
    }

    const attachmentCount = await countAttachments('leave', leave.id);
    const resultFlex = leaveFlex.leaveResultFlex({
      id: leave.id,
      employeeName: getDisplayName(leave.employees, leave.line_user_id),
      type: leave.leave_type,
      from: leave.start_date,
      to: leave.end_date,
      status: leave.status,
      approvedBy: getDisplayName({ name: leave.audit_actor_name }, { username: leave.decided_by }, leave.decided_by),
      attachmentCount,
    });

    try {
      await push(lineUserId, resultFlex);
      await supabase
        .from('leaves')
        .update({ line_notified: true, updated_at: new Date().toISOString() })
        .eq('id', leave.id);
    } catch (sendError) {
      console.warn('Leave result LINE push failed:', sendError.message || sendError, { leave_id: leave.id, lineUserId });
    }
  }
}

function formatThaiDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(TH_GREGORY_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatThaiDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(TH_GREGORY_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

async function notifySalesResults() {
  let { data, error } = await supabase
    .from('sales')
    .select('id,sell_date,confirmed_at,confirmed_by,cash_amount,credit_amount,transfer_amount,total_amount,line_group_id,line_notified,branches(code,name)')
.eq('status', 'confirmed')
    .not('line_group_id', 'is', null)
    .or('line_notified.eq.false,line_notified.is.null')
    .order('confirmed_at', { ascending: true });

  if (error) {
    console.warn('Sales notification job query failed:', error.message || error);
    return;
  }

  for (const sale of data || []) {
    const groupId = sale.line_group_id;
    if (!groupId) continue;

    const branchCode = sale.branches ? (sale.branches.code || sale.branches.name) : '-';
    const saleDate = formatThaiDate(sale.sell_date || sale.confirmed_at);
    const approvedBy = getDisplayName(sale.confirmed_by);
    const approvedAt = formatThaiDateTime(sale.confirmed_at);
    const attachmentCount = await countAttachments('sale', sale.id);

    const message = approvedSalesResultFlex({
      saleId: sale.id,
      branchCode,
      saleDate,
      total: sale.total_amount || 0,
      approvedBy,
      approvedAt,
      attachmentCount,
    });

    try {
      await push(groupId, message);
      await supabase
        .from('sales')
        .update({ line_notified: true, updated_at: new Date().toISOString() })
        .eq('id', sale.id);
    } catch (sendError) {
      console.warn('Sales approval notification failed:', sendError.message || sendError, { sale_id: sale.id, groupId });
    }
  }
}

async function notifyCashDepositResults() {
  let { data, error } = await supabase
    .from('cash_deposits')
    .select(`
      id,
      deposit_date,
      expected_amount,
      deposited_amount,
      status,
      verified_by,
      verified_at,
      slip_url,
      line_group_id,
      line_notified,
      branches(code,name),
      bank_accounts(bank_name,bank_short,account_name,account_no),
      employees(name,nickname)
    `)
    .eq('status', 'verified')
    .not('line_group_id', 'is', null)
    .or('line_notified.eq.false,line_notified.is.null')
    .order('verified_at', { ascending: true });

  if (error) {
    console.warn('Cash deposit notification job query failed:', error.message || error);
    return;
  }

  for (const deposit of data || []) {
    const groupId = deposit.line_group_id;
    if (!groupId) continue;

    const branchCode = deposit.branches ? (deposit.branches.code || deposit.branches.name) : '-';
    const depositDate = formatThaiDate(deposit.deposit_date);
    const verifiedBy = getDisplayName(deposit.verified_by);
    const verifiedAt = formatThaiDateTime(deposit.verified_at);
    const attachmentCount = await countAttachments('cash_deposit', deposit.id);
    const slipCount = attachmentCount || (deposit.slip_url ? 1 : 0);

    const message = depositFlex.depositApprovedResultFlex({
      id: deposit.id,
      branchCode,
      depositDate,
      depositedAmount: deposit.deposited_amount,
      slipCount,
      verifiedBy,
      verifiedAt,
    });

    try {
      await push(groupId, message);
      await supabase
        .from('cash_deposits')
        .update({ line_notified: true, updated_at: new Date().toISOString() })
        .eq('id', deposit.id);
    } catch (sendError) {
      console.warn('Cash deposit approval notification failed:', sendError.message || sendError, { deposit_id: deposit.id, groupId });
    }
  }
}

async function notifyPendingLiffInspections() {
  const { data, error } = await supabase
    .from('store_inspections')
    .select(`
      id,
      branch_id,
      submitted_by,
      work_date,
      submit_time,
      status,
      inspection_items,
      photo_count,
      line_group_id,
      line_user_id,
      branches(code,name),
      employees(name,nickname,line_user_id)
    `)
    .eq('status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(20);

  if (error) {
    console.warn('Pending LIFF inspection notification query failed:', error.message || error);
    return;
  }

  for (const inspection of data || []) {
    const items = inspection.inspection_items && typeof inspection.inspection_items === 'object'
      ? inspection.inspection_items
      : {};
    if (!items.inspected_shop || items.inspection_source !== 'liff' || items.approval_flex_sent_at) continue;

    const { data: attachments, error: attachmentError } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', 'store_inspection')
      .eq('entity_id', inspection.id)
      .order('created_at', { ascending: true });

    if (attachmentError) {
      console.warn('Pending inspection attachments query failed:', attachmentError.message || attachmentError, { inspection_id: inspection.id });
    }

    const branchCode = inspection.branches ? (inspection.branches.code || inspection.branches.name) : inspection.branch_id;
    const submitterName = getDisplayName(inspection.employees);
    const pendingFlex = inspectionPendingFlex({
      inspectionId: inspection.id,
      branchCode,
      submitterName,
      photoCount: inspection.photo_count || (attachments || []).length,
      attachments: attachments || [],
      workDate: inspection.work_date,
      submitTime: inspection.submit_time,
      detailUri: buildInspectionDetailUrl(inspection),
      showActions: false,
    });

    const targets = new Map();
    if (inspection.line_group_id) targets.set(inspection.line_group_id, 'group');

    let managers = [];
    try {
      managers = await userRepo.findBranchManagers({
        id: inspection.branch_id,
        code: inspection.branches && inspection.branches.code,
        name: inspection.branches && inspection.branches.name,
      });
    } catch (managerError) {
      console.warn('Pending inspection manager lookup failed:', managerError.message || managerError, { inspection_id: inspection.id });
    }

    for (const manager of managers) {
      if (manager.line_user_id) targets.set(manager.line_user_id, 'manager');
    }

    let sentCount = 0;
    for (const [target, targetType] of targets.entries()) {
      try {
        await push(target, pendingFlex);
        sentCount += 1;
      } catch (sendError) {
        console.warn('Pending inspection LINE push failed:', getLineErrorDetail(sendError), {
          inspection_id: inspection.id,
          targetType,
        });
      }
    }

    if (sentCount > 0) {
      await supabase
        .from('store_inspections')
        .update({
          inspection_items: {
            ...items,
            approval_flex_sent_at: new Date().toISOString(),
            approval_flex_target_count: sentCount,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', inspection.id);
    }
  }
}

async function notifyInspectionResults() {
  const { data, error } = await supabase
    .from('store_inspections')
    .select(`
      id,
      work_date,
      submit_time,
      close_time,
      status,
      score,
      photo_count,
      manager_note,
      reviewed_by,
      review_time,
      updated_at,
      line_group_id,
      line_notified,
      branches(code,name),
      employees(name,nickname)
    `)
    .in('status', ['pass', 'issue'])
    .not('line_group_id', 'is', null)
    .or('line_notified.eq.false,line_notified.is.null')
    .order('updated_at', { ascending: true });

  if (error) {
    console.warn('Inspection notification job query failed:', error.message || error);
    return;
  }

  for (const inspection of data || []) {
    const groupId = inspection.line_group_id;
    if (!groupId) continue;

    const branchCode = inspection.branches ? (inspection.branches.code || inspection.branches.name) : '-';
    const reviewedBy = getDisplayName(inspection.reviewed_by);
    const reviewTime = inspection.review_time || null;

    const message = inspectionResultFlex({
      inspectionId: inspection.id,
      branchCode,
      status: inspection.status,
      photoCount: inspection.photo_count || 0,
      reviewedBy,
      reviewTime,
      managerNote: inspection.manager_note,
    });

    try {
      await push(groupId, message);
      await supabase
        .from('store_inspections')
        .update({
          line_notified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inspection.id);
    } catch (sendError) {
      console.warn('Inspection result LINE push failed:', getLineErrorDetail(sendError), { inspection_id: inspection.id, groupId });
    }
  }
}

async function runLineJobs(date = new Date()) {
  if (running) return;
  running = true;
  try {
    await sendLeaveResults();
    await notifySalesResults();
    await notifyCashDepositResults();
    await notifyPendingLiffInspections();
    await notifyInspectionResults();
    await sendTodayWarningLetters(date);
    await sendTodayAttendanceAlerts(date);
    await sendMonthEndPayroll(date);
  } catch (error) {
    console.warn('LINE jobs failed:', error.message || error);
  } finally {
    running = false;
  }
}

module.exports = {
  runLineJobs,
  sendPendingWarningLetters,
  sendTodayWarningLetters,
  sendTodayAttendanceAlerts,
  sendMonthEndPayroll,
  notifySalesResults,
  notifyCashDepositResults,
  notifyPendingLiffInspections,
  notifyInspectionResults,
};
