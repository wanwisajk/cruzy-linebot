const branchRepo = require('../../../backend/repositories/branch.repo');
const { supabase } = require('../../../backend/config/supabase');

function extractBranchCode(text) {
  const match = String(text || '').match(/\b([A-Z]{2,5})\b/i);
  return match ? match[1].toUpperCase() : null;
}

async function resolveEmployeeBranch(employeeId, workDate) {
  if (employeeId && workDate) {
    const { data: schedule } = await supabase
      .from('schedules')
      .select('branches(id,name,code,line_group_id)')
      .eq('employee_id', employeeId)
      .eq('work_date', workDate)
      .eq('is_off', false)
      .limit(1)
      .maybeSingle();

    if (schedule && schedule.branches) {
      return { branch: schedule.branches, matchedBy: 'schedule' };
    }
  }

  if (employeeId) {
    const { data: preferred } = await supabase
      .from('employee_branch_eligibility')
      .select('branches(id,name,code,line_group_id)')
      .eq('employee_id', employeeId)
      .eq('can_work', true)
      .order('is_preferred', { ascending: false })
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (preferred && preferred.branches) {
      return { branch: preferred.branches, matchedBy: 'employee_branch_eligibility' };
    }
  }

  return { branch: null, matchedBy: null };
}

async function resolveBranchFromEvent(event, text, options = {}) {
  const source = event.source || {};
  if (source.groupId) {
    const branch = await branchRepo.findByLineGroupId(source.groupId);
    if (branch) return { branch, lineGroupId: source.groupId, matchedBy: 'line_group_id' };
  }

  const branchCode = extractBranchCode(text);
  if (branchCode) {
    const branch = await branchRepo.findByCode(branchCode);
    if (branch) return { branch, lineGroupId: source.groupId || null, matchedBy: 'branch_code' };
  }

  const employeeBranch = await resolveEmployeeBranch(options.employeeId, options.workDate);
  if (employeeBranch.branch) {
    return {
      branch: employeeBranch.branch,
      lineGroupId: source.groupId || employeeBranch.branch.line_group_id || null,
      matchedBy: employeeBranch.matchedBy,
    };
  }

  return { branch: null, lineGroupId: source.groupId || null, matchedBy: null };
}

module.exports = {
  extractBranchCode,
  resolveBranchFromEvent,
  resolveEmployeeBranch,
};
