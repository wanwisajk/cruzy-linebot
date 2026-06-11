const employeeRepo = require('../../../../backend/repositories/employee.repo');
const branchRepo = require('../../../../backend/repositories/branch.repo');
const { supabase } = require('../../../../backend/config/supabase');
const closeFlex = require('../../flex/closeFlex');
const { replyOrPush } = require('../../reply');
const { logEvent } = require('../../utils/audit');

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const source = event.source || {};
  const lineUserId = source.userId || null;
  const employee = lineUserId ? await employeeRepo.findByLineUserId(lineUserId) : null;

  const branchMatch = String(text || '').match(/\b([A-Z]{2,5})\b/i);
  const branchCode = branchMatch ? branchMatch[1].toUpperCase() : null;
  const branch = branchCode ? await branchRepo.findByCode(branchCode) : null;
  const now = new Date();
  const workDate = now.toISOString().slice(0, 10);
  const clockOut = now.toTimeString().slice(0, 8);

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
      await supabase.from('attendance').update({ clock_out: clockOut }).eq('id', attendance.id);
    } else {
      await supabase.from('attendance').insert([{
        employee_id: employee.id,
        branch_id: branch.id,
        work_date: workDate,
        clock_out: clockOut,
      }]);
    }
  }

  await logEvent('close_shop_reported', {
    actor: employee ? employee.id : lineUserId,
    branch_id: branch ? branch.id : null,
    branch_code: branch ? branch.code : branchCode,
    reported_at: now.toISOString(),
    raw_text: text,
  });

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [closeFlex({
      branchCode: branch ? branch.code : branchCode,
      employeeName: employee ? (employee.nickname || employee.name) : 'ไม่ระบุ',
      time: now.toLocaleString('th-TH'),
    })],
  });
}

module.exports = { handle };
