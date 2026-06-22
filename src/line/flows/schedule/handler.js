const branchRepo = require('../../../../backend/repositories/branch.repo');
const employeeRepo = require('../../../../backend/repositories/employee.repo');
const scheduleRepo = require('../../../../backend/repositories/schedule.repo');
const { replyOrPush } = require('../../reply');
const { resolveLineActor } = require('../../utils/actor');
const { resolveBranchFromEvent } = require('../../utils/context');
const scheduleFlex = require('../../flex/scheduleFlex');
const { parseScheduleCommand } = require('./parser');

function isPrivateEvent(event) {
  const source = event.source || {};
  return !source.groupId && !source.roomId;
}

function normalizeQuery(query) {
  return String(query || '')
    .replace(/^(?:ของ|สาขา|พนักงาน|employee|branch)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExactBranch(query, branches) {
  const normalized = query.toLowerCase();
  return branches.find((branch) =>
    String(branch.code || '').toLowerCase() === normalized ||
    String(branch.name || '').toLowerCase() === normalized ||
    String(branch.id || '') === normalized
  );
}

function getExactEmployee(query, employees) {
  const normalized = query.toLowerCase();
  return employees.find((employee) =>
    String(employee.id || '').toLowerCase() === normalized ||
    String(employee.name || '').toLowerCase() === normalized ||
    String(employee.nickname || '').toLowerCase() === normalized
  );
}

async function findBranchFromQuery(query) {
  const value = normalizeQuery(query);
  if (!value) return { branch: null, branches: [] };

  const byCode = /^[A-Za-z0-9_-]{1,16}$/.test(value) ? await branchRepo.findByCode(value) : null;
  if (byCode) return { branch: byCode, branches: [byCode] };

  const branches = await branchRepo.searchByKeyword(value, 8);
  return { branch: getExactBranch(value, branches) || (branches.length === 1 ? branches[0] : null), branches };
}

async function findEmployeeFromQuery(query) {
  const value = normalizeQuery(query);
  if (!value) return { employee: null, employees: [] };

  const byId = /^[A-Za-z0-9_-]{1,64}$/.test(value) ? await employeeRepo.findById(value) : null;
  if (byId) return { employee: byId, employees: [byId] };

  const employees = await employeeRepo.searchByKeyword(value, 8);
  return { employee: getExactEmployee(value, employees) || (employees.length === 1 ? employees[0] : null), employees };
}

function uniqueBranches(branches) {
  const seen = new Set();
  return (branches || []).filter((branch) => {
    if (!branch || seen.has(branch.id)) return false;
    seen.add(branch.id);
    return true;
  });
}

function eachDate(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function getBranchFromScopeValue(value) {
  const scopeValue = String(value || '').trim();
  if (!scopeValue) return null;

  const branches = await branchRepo.findAllWithRegions();
  return branches.find((branch) =>
    String(branch.id) === scopeValue ||
    String(branch.code || '').toLowerCase() === scopeValue.toLowerCase() ||
    String(branch.name || '').toLowerCase() === scopeValue.toLowerCase()
  ) || null;
}

async function scopedBranches(event, actor, startDate, endDate) {
  const source = event.source || {};
  if (source.groupId) {
    const context = await resolveBranchFromEvent(event, '');
    if (context.branch) return { branches: [context.branch], label: `สาขา ${context.branch.code || context.branch.name}` };
  }

  if (actor && actor.user) {
    const user = actor.user;
    const scopeType = String(user.scope_type || '').toLowerCase();
    const scopeValue = String(user.scope_value || '').trim();
    const allBranches = await branchRepo.findAllWithRegions();

    if (scopeType.includes('branch') || scopeType.includes('store')) {
      const branch = await getBranchFromScopeValue(scopeValue);
      return {
        branches: branch ? [branch] : [],
        label: branch ? `สาขา ${branch.code || branch.name}` : 'สาขาที่ดูแล',
      };
    }

    if (scopeType.includes('region') || scopeType.includes('area') || scopeType.includes('zone')) {
      const branches = allBranches.filter((branch) =>
        String(branch.region_id || '') === scopeValue ||
        String(branch.regions && branch.regions.name || '').toLowerCase() === scopeValue.toLowerCase()
      );
      return { branches, label: `โซน ${scopeValue}` };
    }

    if (scopeType.includes('employee') && actor.employee) {
      const branches = await scheduleRepo.findEligibleBranchesByEmployee(actor.employee.id);
      return { branches: uniqueBranches(branches), label: `ของ ${actor.name}` };
    }

    return { branches: allBranches, label: 'ทุกสาขา' };
  }

  if (actor && actor.employee) {
    const eligible = await scheduleRepo.findEligibleBranchesByEmployee(actor.employee.id);
    if (eligible.length > 0) return { branches: uniqueBranches(eligible), label: `ของ ${actor.name}` };

    const ownSchedules = await scheduleRepo.findByEmployeeBetween(actor.employee.id, startDate, endDate);
    return {
      branches: uniqueBranches(ownSchedules.map((schedule) => schedule.branches).filter(Boolean)),
      label: `ของ ${actor.name}`,
    };
  }

  return { branches: await branchRepo.findAllWithRegions(), label: 'ทุกสาขา' };
}

async function handleEmployeeSchedule(event, employee, parsed, branchFilter) {
  let schedules = await scheduleRepo.findByEmployeeBetween(employee.id, parsed.startDate, parsed.endDate);
  if (branchFilter) {
    schedules = schedules.filter((schedule) => Number(schedule.branch_id) === Number(branchFilter.id));
  }

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [scheduleFlex.employeeScheduleFlex({
      employee,
      schedules,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      branchFilter,
    })],
  });
}

async function handleBranchSchedule(event, branch, parsed) {
  const schedules = await scheduleRepo.findByBranchBetween(branch.id, parsed.startDate, parsed.endDate);
  await replyOrPush({
    replyToken: event.replyToken,
    messages: [scheduleFlex.branchScheduleFlex({
      branch,
      schedules,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    })],
  });
}

async function handleMissingSchedule(event, actor, parsed) {
  const scoped = await scopedBranches(event, actor, parsed.startDate, parsed.endDate);
  const branches = scoped.branches;
  const branchIds = branches.map((branch) => branch.id);
  const dates = eachDate(parsed.startDate, parsed.endDate);
  const activeSchedules = branchIds.length > 0
    ? await scheduleRepo.findActiveBetween(parsed.startDate, parsed.endDate, branchIds)
    : [];

  const staffed = new Set(activeSchedules.map((schedule) => `${schedule.branch_id}:${schedule.work_date}`));
  const items = branches.map((branch) => {
    const missingDates = dates.filter((date) => !staffed.has(`${branch.id}:${date}`));
    return { branch, missingDates };
  }).filter((item) => item.missingDates.length > 0);

  const totalMissing = items.reduce((sum, item) => sum + item.missingDates.length, 0);

  await replyOrPush({
    replyToken: event.replyToken,
    messages: [scheduleFlex.missingScheduleFlex({
      items,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      scopeLabel: scoped.label,
      totalMissing,
    })],
  });
}

async function handlePrivateEmployeeSchedule(event, actor, parsed) {
  const query = normalizeQuery(parsed.query);
  const branchMatch = query ? await findBranchFromQuery(query) : { branch: null };
  return handleEmployeeSchedule(event, actor.employee, parsed, branchMatch.branch);
}

async function handle(event) {
  const text = event.message && event.message.type === 'text' ? event.message.text : '';
  const parsed = parseScheduleCommand(text);
  const lineUserId = event.source && event.source.userId;
  const actor = lineUserId ? await resolveLineActor(lineUserId) : null;
  const query = normalizeQuery(parsed.query);

  if (parsed.isMissing) {
    return handleMissingSchedule(event, actor, parsed);
  }

  if (isPrivateEvent(event) && actor && actor.employee && !actor.user) {
    return handlePrivateEmployeeSchedule(event, actor, parsed);
  }

  if (!query) {
    const context = await resolveBranchFromEvent(event, '');
    if (context.branch) return handleBranchSchedule(event, context.branch, parsed);

    if (actor && actor.employee) return handleEmployeeSchedule(event, actor.employee, parsed);

    return replyOrPush({
      replyToken: event.replyToken,
      messages: [scheduleFlex.emptyFlex({
        title: 'ยังไม่รู้ว่าจะดูตารางของใคร',
        message: 'พิมพ์เช่น #ตาราง CCA, #ตาราง สมชาย, #ตาราง CCA 1/6-7/6 หรือผูก LINE ด้วยคำสั่ง #พนักงาน <รหัสพนักงาน>',
      })],
    });
  }

  const wantsBranch = /^(?:สาขา|branch)\s+/i.test(parsed.query);
  const wantsEmployee = /^(?:พนักงาน|employee)\s+/i.test(parsed.query);
  const [branchMatch, employeeMatch] = await Promise.all([
    wantsEmployee ? Promise.resolve({ branch: null, branches: [] }) : findBranchFromQuery(query),
    wantsBranch ? Promise.resolve({ employee: null, employees: [] }) : findEmployeeFromQuery(query),
  ]);

  if (branchMatch.branch && !employeeMatch.employee) {
    return handleBranchSchedule(event, branchMatch.branch, parsed);
  }

  if (employeeMatch.employee && !branchMatch.branch) {
    return handleEmployeeSchedule(event, employeeMatch.employee, parsed);
  }

  if (branchMatch.branch && employeeMatch.employee) {
    const exactBranch = getExactBranch(query, branchMatch.branches);
    const exactEmployee = getExactEmployee(query, employeeMatch.employees);
    if (exactBranch && !exactEmployee) return handleBranchSchedule(event, exactBranch, parsed);
    if (exactEmployee && !exactBranch) return handleEmployeeSchedule(event, exactEmployee, parsed);
  }

  if (branchMatch.branches.length === 0 && employeeMatch.employees.length === 0) {
    return replyOrPush({
      replyToken: event.replyToken,
      messages: [scheduleFlex.emptyFlex({
        title: 'ไม่พบรายการตาราง',
        message: `ไม่พบพนักงานหรือสาขาที่ตรงกับ "${query}"`,
      })],
    });
  }

  return replyOrPush({
    replyToken: event.replyToken,
    messages: [scheduleFlex.ambiguousFlex({
      query,
      branches: branchMatch.branches,
      employees: employeeMatch.employees,
    })],
  });
}

module.exports = {
  handle,
};
