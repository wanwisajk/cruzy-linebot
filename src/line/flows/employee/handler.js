const { supabase } = require('../../../../backend/config/supabase');
const payrollFlex = require('../../flex/payrollFlex');
const warningFlex = require('../../flex/warningFlex');
const alertFlex = require('../../flex/alertFlex');
const { replyOrPush } = require('../../reply');
const { resolveLineActor } = require('../../utils/actor');
const { getDisplayName } = require('../../utils/displayName');

async function findEmployee(event) {
  const lineUserId = event.source && event.source.userId;
  if (!lineUserId) return null;
  const actor = await resolveLineActor(lineUserId);
  return actor && actor.employee ? actor.employee : null;
}

async function handlePayroll(event) {
  const employee = await findEmployee(event);
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน>' }] });
    return;
  }

  const { data: profile } = await supabase
    .from('employee_pay_profiles')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  const gross = Number((profile && (profile.monthly_salary || profile.daily_rate)) || employee.salary || 0);
  const allowance = Number((profile && profile.special_allowance) || 0);
  const socialSecurity = Number((profile && profile.social_security_amount) || 0);
  const deductions = socialSecurity;
  const net = gross + allowance - deductions;

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [payrollFlex({
      employeeName: getDisplayName(employee),
      gross,
      allowance,
      deductions,
      net,
      payCycle: profile && profile.pay_cycle,
    })],
  });
}

async function handleWarning(event) {
  const employee = await findEmployee(event);
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน>' }] });
    return;
  }

  const { data } = await supabase
    .from('warning_letters')
    .select('id,level,issue_date,reason,status,is_signed_by_emp')
    .eq('employee_id', employee.id)
    .order('issue_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีหนังสือเตือนในระบบ' }] });
    return;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [warningFlex({
      id: data.id,
      employeeName: getDisplayName(employee),
      level: data.level,
      issueDate: data.issue_date,
      note: data.reason,
      status: data.status,
      signed: data.is_signed_by_emp,
    })],
  });
}

async function handleAttendanceAlert(event) {
  const employee = await findEmployee(event);
  if (!employee) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาผูก LINE ด้วยคำสั่ง: #พนักงาน <รหัสพนักงาน>' }] });
    return;
  }

  const { data } = await supabase
    .from('attendance_alerts')
    .select('alert_type,work_date,title,detail,severity,alert_time,branches(code,name)')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    await replyOrPush({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยังไม่มีแจ้งเตือนขาด ลา หรือมาสายในระบบ' }] });
    return;
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [alertFlex({
      title: data.title || 'แจ้งเตือนการเข้างาน',
      body: [
        `วันที่: ${data.work_date}`,
        `สาขา: ${data.branches ? data.branches.code : '-'}`,
        data.alert_time ? `เวลา: ${data.alert_time}` : null,
        data.detail,
      ].filter(Boolean).join('\n'),
      severity: data.severity,
    })],
  });
}

module.exports = {
  handlePayroll,
  handleWarning,
  handleAttendanceAlert,
};
