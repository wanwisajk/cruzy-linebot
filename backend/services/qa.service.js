const employeeRepo = require('../repositories/employee.repo');
const branchRepo = require('../repositories/branch.repo');
const scheduleRepo = require('../repositories/schedule.repo');
const flex = require('./flex.service');
const { formatDate, todayBangkok, addDaysBangkok } = require('../utils/date');

async function answerQuestion({ text, source }) {
  const normalized = normalize(text);
  const lineUserId = source.userId;

  if (isHelp(normalized)) {
    return flex.menu();
  }

  const registerId = extractRegisterEmployeeId(text);
  if (registerId) {
    return answerRegister(lineUserId, registerId);
  }

  if (matchesAny(normalized, ['userid', 'user id', 'line id', 'ไอดี', 'ไอดีไลน์', 'line user id'])) {
    return answerLineUserId(lineUserId);
  }

  if (matchesAny(normalized, ['profile', 'โปรไฟล์', 'ฉันคือใคร', 'ข้อมูลฉัน'])) {
    return answerProfile(lineUserId);
  }

  if (matchesAny(normalized, ['ตารางวันนี้', 'วันนี้', 'งานวันนี้'])) {
    return answerScheduleForDate(lineUserId, todayBangkok(), 'ตารางงานวันนี้');
  }

  if (matchesAny(normalized, ['ตารางพรุ่งนี้', 'พรุ่งนี้', 'งานพรุ่งนี้'])) {
    return answerScheduleForDate(lineUserId, addDaysBangkok(1), 'ตารางงานพรุ่งนี้');
  }

  if (matchesAny(normalized, ['schedule', 'ตารางงาน', 'ตาราง'])) {
    return answerUpcomingSchedule(lineUserId);
  }

  if (matchesAny(normalized, ['branch', 'branches', 'สาขา', 'รายชื่อสาขา'])) {
    return answerBranches();
  }

  const employeeSearch = extractAfterAny(text, ['พนักงาน', 'employee']);
  if (employeeSearch) {
    return answerEmployeeSearch(employeeSearch);
  }

  return flex.text(
    [
      'ยังไม่เจอคำตอบจากคำถามนี้ครับ',
      'ตอนนี้ถามได้เช่น: เมนู, โปรไฟล์, ตารางวันนี้, ตารางพรุ่งนี้, ตารางงาน, สาขา',
    ].join('\n')
  );
}

async function answerProfile(lineUserId) {
  if (!lineUserId) {
    return flex.text('ไม่พบ LINE userId จากข้อความนี้ครับ');
  }

  const employee = await employeeRepo.findByLineUserId(lineUserId);
  if (!employee) {
    return flex.text('ยังไม่พบการผูก LINE ของคุณกับพนักงานในระบบครับ');
  }

  return flex.profile(employee);
}

function answerLineUserId(lineUserId) {
  if (!lineUserId) {
    return flex.text('ไม่พบ LINE userId จากข้อความนี้ครับ');
  }

  return flex.text(`LINE userId ของคุณคือ:\n${lineUserId}`);
}

async function answerScheduleForDate(lineUserId, date, title) {
  if (!lineUserId) {
    return flex.text('ไม่พบ LINE userId จากข้อความนี้ครับ');
  }

  const employee = await employeeRepo.findByLineUserId(lineUserId);
  if (!employee) {
    return flex.text('ยังไม่พบการผูก LINE ของคุณกับพนักงานในระบบครับ');
  }

  const schedules = await scheduleRepo.findByEmployeeAndDate(employee.id, date);
  if (schedules.length === 0) {
    return flex.text(`${title} (${formatDate(date)})\nไม่พบตารางงานของคุณครับ`);
  }

  return flex.scheduleList(title, schedules);
}

async function answerUpcomingSchedule(lineUserId) {
  if (!lineUserId) {
    return flex.text('ไม่พบ LINE userId จากข้อความนี้ครับ');
  }

  const employee = await employeeRepo.findByLineUserId(lineUserId);
  if (!employee) {
    return flex.text('ยังไม่พบการผูก LINE ของคุณกับพนักงานในระบบครับ');
  }

  const schedules = await scheduleRepo.findUpcomingByEmployee(employee.id, 7);
  if (schedules.length === 0) {
    return flex.text('ไม่พบตารางงาน 7 วันข้างหน้าของคุณครับ');
  }

  return flex.scheduleList('ตารางงาน 7 วันข้างหน้า', schedules);
}

async function answerBranches() {
  const branches = await branchRepo.findAllWithRegions();
  if (branches.length === 0) {
    return flex.text('ยังไม่พบข้อมูลสาขาในระบบครับ');
  }

  const lines = branches
    .slice(0, 20)
    .map((branch) => {
      const regionName = branch.regions?.name ? ` (${branch.regions.name})` : '';
      return `- ${branch.code}: ${branch.name}${regionName}`;
    });

  return flex.text(`รายชื่อสาขา\n${lines.join('\n')}`);
}

async function answerEmployeeSearch(keyword) {
  const employees = await employeeRepo.searchByName(keyword);
  if (employees.length === 0) {
    return flex.text(`ไม่พบพนักงานที่ตรงกับ "${keyword}" ครับ`);
  }

  const lines = employees.map((employee) => {
    const nick = employee.nickname ? ` (${employee.nickname})` : '';
    return `- ${employee.name}${nick}: ${employee.position || '-'}`;
  });

  return flex.text(`ผลค้นหาพนักงาน\n${lines.join('\n')}`);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isHelp(value) {
  return matchesAny(value, ['help', 'menu', 'เมนู', 'ช่วยเหลือ', 'คำสั่ง']);
}

function matchesAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function extractAfterAny(value, prefixes) {
  const raw = String(value || '').trim();
  const lowered = raw.toLowerCase();

  for (const prefix of prefixes) {
    const index = lowered.indexOf(prefix.toLowerCase());
    if (index >= 0) {
      return raw.slice(index + prefix.length).trim();
    }
  }

  return '';
}

function extractRegisterEmployeeId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:สมัคร|register)\s*(\d+)$/i);
  return match ? match[1] : null;
}

async function answerRegister(lineUserId, employeeId) {
  if (!lineUserId) {
    return flex.text('ไม่พบ LINE userId จากข้อความนี้ครับ ไม่สามารถสมัครได้');
  }

  const employee = await employeeRepo.findById(employeeId);
  if (!employee) {
    return flex.text(`ไม่พบพนักงานหมายเลข ${employeeId} ครับ`);
  }

  if (employee.line_user_id && employee.line_user_id !== lineUserId) {
    return flex.text(`พนักงานหมายเลข ${employeeId} ถูกผูกกับ LINE account อื่นอยู่แล้วครับ`);
  }

  const existingEmployee = await employeeRepo.findByLineUserId(lineUserId);
  if (existingEmployee && existingEmployee.id !== employeeId) {
    return flex.text('LINE ของคุณเชื่อมกับพนักงานคนอื่นอยู่แล้ว หากต้องการเปลี่ยนกรุณาติดต่อผู้ดูแลระบบครับ');
  }

  await employeeRepo.updateLineUserId(employeeId, lineUserId);
  return flex.text(`ผูก LINE ของคุณเข้ากับพนักงานหมายเลข ${employeeId} สำเร็จแล้วครับ\nชื่อ: ${employee.name}`);
}

module.exports = {
  answerQuestion,
};
