const { supabase } = require('../../../backend/config/supabase');
const { lineClient } = require('../../../backend/config/line');
const warningFlex = require('../flex/warningFlex');
const payrollFlex = require('../flex/payrollFlex');
const alertFlex = require('../flex/alertFlex');
const leaveFlex = require('../flex/leaveFlex');
const { approvedSalesResultFlex, rejectedFlex: rejectedSalesResultFlex } = require('../flex/salesFlex');
const depositFlex = require('../flex/depositFlex');
const { inspectionPendingFlex, inspectionResultFlex } = require('../flex/inspectFlex');
const { COLORS, row: uiRow, card, bubble, primaryButton } = require('../flex/uiFlex');
const { getDisplayName } = require('../utils/displayName');
const { getConfiguredLiffBaseUrl, appendQueryToLiffUrl } = require('../utils/liff');
const userRepo = require('../../../backend/repositories/user.repo');

let running = false;
const sentShiftReminderKeys = new Set();
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const TH_GREGORY_LOCALE = 'th-TH-u-ca-gregory-nu-latn';
const OPEN_REMINDER_MINUTES_BEFORE = 15;
const CLOSE_REMINDER_MINUTES_BEFORE = 15;

function inspectionLiffBaseUrl() {
  return getConfiguredLiffBaseUrl('LIFF_INSPECTION_URL', 'LIFF_URL');
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
  return appendQueryToLiffUrl(path, query);
}

function isLineUriActionSafe(uri) {
  const value = String(uri || '').trim();
  return /^https?:\/\//i.test(value) && value.length <= 1000;
}

function filterLineSafeAttachments(attachments = []) {
  return (attachments || []).filter((attachment) => {
    const uri = attachment && (attachment.file_url || attachment.url || attachment.uri);
    return isLineUriActionSafe(uri);
  });
}

function isLiffInspection(inspection = {}, items = {}) {
  const source = String(
    items.inspection_source ||
    items.inspectionSource ||
    items.source ||
    items.submission_source ||
    items.submissionSource ||
    inspection.source ||
    ''
  ).trim().toLowerCase();

  return source === 'liff' || source.includes('liff');
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

function bangkokTimeParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

function bangkokMinuteOfDay(date = new Date()) {
  const parts = bangkokTimeParts(date);
  return (parts.hour * 60) + parts.minute;
}

function minutesOfTime(value, fallback) {
  const text = String(value || fallback || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour * 60) + minute;
}

function timeLabel(value, fallback) {
  const text = String(value || fallback || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '-';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function isReminderWindow(nowMinutes, targetMinutes) {
  return Number.isFinite(nowMinutes) &&
    Number.isFinite(targetMinutes) &&
    nowMinutes >= targetMinutes &&
    nowMinutes < targetMinutes + 2;
}

function shiftReminderFlex({ type, branchCode, branchName, time, commandText, minutesBefore }) {
  const isOpen = type === 'open';
  return bubble({
    title: isOpen ? '⏰ ใกล้เวลาเปิดร้าน' : '⏰ ใกล้เวลาปิดร้าน',
    subtitle: `สาขา ${branchCode || '-'}`,
    color: isOpen ? COLORS.teal : COLORS.warning,
    altText: isOpen ? 'แจ้งเตือนเปิดร้าน' : 'แจ้งเตือนปิดร้าน',
    body: [
      card([
        uiRow('สาขา', branchName ? `${branchCode || '-'} ${branchName}` : branchCode || '-'),
        uiRow(isOpen ? 'เวลาเปิด' : 'เวลาปิด', `${time} น.`, isOpen ? COLORS.teal : COLORS.warning),
      ]),
      {
        type: 'text',
        text: isOpen
          ? 'ยังไม่พบการเปิดร้านของวันนี้ กรุณาเปิดร้านและส่งรูปหน้าร้านให้เรียบร้อย'
          : `เหลืออีก ${minutesBefore || CLOSE_REMINDER_MINUTES_BEFORE} นาทีถึงเวลาปิดร้าน กรุณาปิดร้านให้ตรงเวลาและส่งรูปปิดร้าน`,
        size: 'sm',
        color: COLORS.ink,
        wrap: true,
      },
    ],
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        primaryButton(isOpen ? 'เปิดร้าน' : 'ปิดร้าน', { type: 'message', text: commandText }, isOpen ? COLORS.success : COLORS.warning),
      ],
    },
  });
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

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  const mentionsColumn = columnName ? new RegExp(`\\b${columnName}\\b`, 'i').test(message) : true;
  return mentionsColumn && (
    error.code === 'PGRST204' ||
    /column|schema cache/i.test(message)
  );
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
    .select('id,sell_date,status,confirmed_at,confirmed_by,cash_amount,credit_amount,transfer_amount,total_amount,line_group_id,line_notified,branches(code,name)')
    .in('status', ['confirmed', 'rejected'])
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

    const message = sale.status === 'rejected'
      ? rejectedSalesResultFlex({
        saleId: sale.id,
        branchCode,
        rejectedBy: approvedBy,
        rejectedAt: approvedAt,
      })
      : approvedSalesResultFlex({
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
      console.warn('Sales result notification failed:', sendError.message || sendError, { sale_id: sale.id, status: sale.status, groupId });
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
    .in('status', ['verified', 'rejected'])
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

    const message = deposit.status === 'rejected'
      ? depositFlex.depositRejectedFlex({
        depositId: deposit.id,
        branchCode,
        rejectedBy: verifiedBy,
        rejectedAt: verifiedAt,
      })
      : depositFlex.depositApprovedResultFlex({
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
      console.warn('Cash deposit result notification failed:', sendError.message || sendError, { deposit_id: deposit.id, status: deposit.status, groupId });
    }
  }
}

async function notifyPendingLiffInspections() {
  const inspectionSelect = `
      id,
      branch_id,
      submitted_by,
      work_date,
      submit_time,
      status,
      source,
      inspection_items,
      photo_count,
      line_group_id,
      line_user_id,
      branches(code,name),
      employees(name,nickname,line_user_id)
    `;
  const fallbackInspectionSelect = `
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
    `;

  let { data, error } = await supabase
    .from('store_inspections')
    .select(inspectionSelect)
    .eq('status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(20);

  if (error && isMissingColumnError(error, 'source')) {
    const retry = await supabase
      .from('store_inspections')
      .select(fallbackInspectionSelect)
      .eq('status', 'pending')
      .order('updated_at', { ascending: true })
      .limit(20);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.warn('Pending LIFF inspection notification query failed:', error.message || error);
    return;
  }

  for (const inspection of data || []) {
    const items = inspection.inspection_items && typeof inspection.inspection_items === 'object'
      ? inspection.inspection_items
      : {};
    if (!items.inspected_shop || !isLiffInspection(inspection, items) || items.approval_flex_sent_at) continue;

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
    const lineSafeAttachments = filterLineSafeAttachments(attachments || []);
    if ((attachments || []).length !== lineSafeAttachments.length) {
      console.warn('Filtered LINE-unsafe inspection attachment URLs:', {
        inspection_id: inspection.id,
        total: (attachments || []).length,
        safe: lineSafeAttachments.length,
      });
    }
    const pendingFlex = inspectionPendingFlex({
      inspectionId: inspection.id,
      branchCode,
      submitterName,
      photoCount: inspection.photo_count || (attachments || []).length,
      attachments: lineSafeAttachments,
      workDate: inspection.work_date,
      submitTime: inspection.submit_time,
      detailUri: buildInspectionDetailUrl(inspection),
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

async function fetchTodayBranchShiftWindows(workDate) {
  const dayOfWeek = dayOfWeekFromDateString(workDate);
  const { data, error } = await supabase
    .from('branch_staffing_rules')
    .select('id,branch_id,day_of_week,shift_start,shift_end,is_active,branches(id,code,name,line_group_id)')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .order('shift_start', { ascending: true });

  if (error) {
    console.warn('Shift reminder branch rule query failed:', error.message || error);
    return [];
  }

  const byBranch = new Map();
  for (const rule of data || []) {
    if (!rule || rule.is_active === false) continue;

    const branch = rule.branches;
    if (!branch || !branch.line_group_id) continue;

    const startMinutes = minutesOfTime(rule.shift_start, '09:00:00');
    const endMinutes = minutesOfTime(rule.shift_end, '20:00:00');
    if (startMinutes == null || endMinutes == null) continue;

    const key = String(rule.branch_id || branch.id);
    const existing = byBranch.get(key) || {
      branchId: rule.branch_id || branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      lineGroupId: branch.line_group_id,
      shiftStart: rule.shift_start || '09:00:00',
      shiftEnd: rule.shift_end || '20:00:00',
      startMinutes,
      endMinutes,
    };

    if (startMinutes < existing.startMinutes) {
      existing.startMinutes = startMinutes;
      existing.shiftStart = rule.shift_start || existing.shiftStart;
    }
    if (endMinutes > existing.endMinutes) {
      existing.endMinutes = endMinutes;
      existing.shiftEnd = rule.shift_end || existing.shiftEnd;
    }

    byBranch.set(key, existing);
  }

  return [...byBranch.values()];
}

function dayOfWeekFromDateString(dateText) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const parts = bangkokDateParts();
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

async function fetchBranchAttendanceStatus(workDate, branchIds) {
  if (!branchIds.length) return new Map();

  const { data, error } = await supabase
    .from('attendance')
    .select('branch_id,clock_in,clock_out')
    .eq('work_date', workDate)
    .in('branch_id', branchIds);

  if (error) {
    console.warn('Shift reminder attendance query failed:', error.message || error);
    return new Map();
  }

  const statusByBranch = new Map();
  for (const attendance of data || []) {
    const key = String(attendance.branch_id);
    const status = statusByBranch.get(key) || { opened: false, closed: false };
    status.opened = status.opened || Boolean(attendance.clock_in);
    status.closed = status.closed || Boolean(attendance.clock_out);
    statusByBranch.set(key, status);
  }
  return statusByBranch;
}

function rememberShiftReminder(key, date = new Date()) {
  sentShiftReminderKeys.add(key);

  if (sentShiftReminderKeys.size > 5000) {
    const today = localDateString(date);
    for (const item of sentShiftReminderKeys) {
      if (!String(item).includes(`:${today}:`)) {
        sentShiftReminderKeys.delete(item);
      }
    }
  }
}

async function sendShiftReminders(date = new Date()) {
  const today = localDateString(date);
  const nowMinutes = bangkokMinuteOfDay(date);
  const shifts = await fetchTodayBranchShiftWindows(today);
  const attendanceByBranch = await fetchBranchAttendanceStatus(today, shifts.map((item) => item.branchId).filter(Boolean));

  for (const shift of shifts) {
    const branchKey = String(shift.branchId);
    const attendance = attendanceByBranch.get(branchKey) || { opened: false, closed: false };

    const openReminderAt = shift.startMinutes - OPEN_REMINDER_MINUTES_BEFORE;
    const openKey = `open:${today}:${branchKey}:${shift.startMinutes}`;
    if (
      openReminderAt >= 0 &&
      !attendance.opened &&
      isReminderWindow(nowMinutes, openReminderAt) &&
      !sentShiftReminderKeys.has(openKey)
    ) {
      try {
        await push(shift.lineGroupId, shiftReminderFlex({
          type: 'open',
          branchCode: shift.branchCode,
          branchName: shift.branchName,
          time: timeLabel(shift.shiftStart, '09:00:00'),
          commandText: '#เปิดร้าน',
          minutesBefore: OPEN_REMINDER_MINUTES_BEFORE,
        }));
        rememberShiftReminder(openKey, date);
      } catch (sendError) {
        console.warn('Open shop reminder LINE push failed:', getLineErrorDetail(sendError), { branchId: shift.branchId, groupId: shift.lineGroupId });
      }
    }

    const closeReminderAt = shift.endMinutes - CLOSE_REMINDER_MINUTES_BEFORE;
    const closeKey = `close:${today}:${branchKey}:${shift.endMinutes}`;
    if (
      closeReminderAt >= 0 &&
      !attendance.closed &&
      isReminderWindow(nowMinutes, closeReminderAt) &&
      !sentShiftReminderKeys.has(closeKey)
    ) {
      try {
        await push(shift.lineGroupId, shiftReminderFlex({
          type: 'close',
          branchCode: shift.branchCode,
          branchName: shift.branchName,
          time: timeLabel(shift.shiftEnd, '20:00:00'),
          commandText: '#ปิดร้าน',
          minutesBefore: CLOSE_REMINDER_MINUTES_BEFORE,
        }));
        rememberShiftReminder(closeKey, date);
      } catch (sendError) {
        console.warn('Close shop reminder LINE push failed:', getLineErrorDetail(sendError), { branchId: shift.branchId, groupId: shift.lineGroupId });
      }
    }
  }
}

async function runLineJobs(date = new Date()) {
  if (running) return;
  running = true;
  try {
    await sendShiftReminders(date);
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
  sendShiftReminders,
};
