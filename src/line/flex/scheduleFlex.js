const { formatDate, formatTime } = require('../../../backend/utils/date');
const { getDisplayName } = require('../utils/displayName');

// 🎨 ปรับ Palette สีให้ละมุนสไตล์ Modern Tailwind / Minimal
const COLORS = {
  ink: '#1E293B',       // Slate 800 (ดูซอฟต์และแพงกว่าสีดำสนิท)
  muted: '#64748B',     // Slate 500
  soft: '#F8FAFC',      // Slate 50 (พื้นหลังละมุนสายตา)
  white: '#FFFFFF',
  line: '#E2E8F0',      // Slate 200
  blue: '#2563EB',      // Blue 600
  teal: '#0D9488',      // Teal 600
  amber: '#D97406',     // Amber 600
  red: '#DC2626',       // Red 600
};

// 📌 ซับไตเติลแมปสีจับคู่คู่สีพาสเทลเพื่อความสวยงามและปลอดภัย (แทน opacity)
const SUBTITLE_COLORS = {
  '#0D9488': '#CCFBF1', // Teal 100
  '#2563EB': '#DBEAFE', // Blue 100
  '#DC2626': '#FEE2E2', // Red 100
  '#D97406': '#FEF3C7', // Amber 100
};
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function branchText(branch) {
  if (!branch) return '-';
  return [branch.code, branch.name].filter(Boolean).join(' - ') || '-';
}

function dateParts(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function isFullMonth(startDate, endDate) {
  const start = dateParts(startDate);
  const end = dateParts(endDate);
  if (!start || !end || start.year !== end.year || start.month !== end.month) return false;
  const lastDay = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
  return start.day === 1 && end.day === lastDay;
}

function thaiYear(year) {
  return Number(year) + 543;
}

function monthText(dateValue, full = true) {
  const parts = dateParts(dateValue);
  if (!parts) return '-';
  const months = full ? THAI_MONTHS : THAI_MONTHS_SHORT;
  return `${months[parts.month - 1]} ${thaiYear(parts.year)}`;
}

function compactDate(value, options = {}) {
  const parts = dateParts(value);
  if (!parts) return formatDate(value);
  const weekday = options.weekday
    ? `${THAI_WEEKDAYS_SHORT[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()]} `
    : '';
  const year = options.year ? ` ${thaiYear(parts.year)}` : '';
  return `${weekday}${parts.day} ${THAI_MONTHS_SHORT[parts.month - 1]}${year}`;
}

function dateRangeText(startDate, endDate) {
  if (isFullMonth(startDate, endDate)) return `เดือน${monthText(startDate)}`;
  if (startDate === endDate) return compactDate(startDate, { weekday: true, year: true });

  const start = dateParts(startDate);
  const end = dateParts(endDate);
  if (start && end && start.year === end.year && start.month === end.month) {
    return `${start.day}-${end.day} ${THAI_MONTHS_SHORT[start.month - 1]} ${thaiYear(start.year)}`;
  }

  return `${compactDate(startDate, { year: true })} - ${compactDate(endDate, { year: true })}`;
}

function scheduleDateText(value) {
  return compactDate(value, { weekday: true });
}

function missingDatesText(dates, startDate, endDate) {
  if (isFullMonth(startDate, endDate)) {
    return `วันที่ ${dates.map((date) => dateParts(date)?.day || formatDate(date)).join(', ')}`;
  }
  return dates.map((date) => compactDate(date)).join(', ');
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

function shiftText(schedule) {
  if (schedule && schedule.is_off) return 'วันหยุด';
  return `${formatTime(schedule && schedule.shift_start)} - ${formatTime(schedule && schedule.shift_end)}`;
}

// 📊 ปรับดีไซน์กล่องสถิติให้ Clean ไร้เส้นขอบ เน้นตัวเลขชัดๆ
function stat(label, value, color) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#F1F5F9', // Slate 100
    cornerRadius: 'lg',
    paddingAll: 'md',
    flex: 1,
    contents: [
      { type: 'text', text: label, color: COLORS.muted, size: 'xs', weight: 'bold', align: 'center' },
      { type: 'text', text: String(value), color: color || COLORS.blue, size: 'xl', weight: 'bold', align: 'center', margin: 'xs' },
    ],
  };
}

// 📦 ปรับแต่งการ์ดแสดงข้อมูลให้คลีน ลดความหนาของเส้นขอบลง
function panel(contents, options = {}) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: options.backgroundColor || COLORS.white,
    borderColor: options.borderColor || '#F1F5F9',
    borderWidth: '1px',
    cornerRadius: 'lg',
    paddingAll: 'md',
    spacing: options.spacing || 'xs',
    margin: options.margin || 'sm',
    contents: contents.filter(Boolean), // 🔥 ป้องกัน null หลุดเข้าไปใน contents
  };
}

// 🏷️ Header สไตล์เรียบหรู ปลอดภัยจาก property แปลกปลอม
function header(title, subtitle, color) {
  const headerColor = color || COLORS.teal;
  const subColor = SUBTITLE_COLORS[headerColor] || '#E2E8F0';

  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: headerColor,
    paddingAll: 'xl',
    contents: [
      { type: 'text', text: title, color: COLORS.white, weight: 'bold', size: 'xl', wrap: true },
      subtitle ? { type: 'text', text: subtitle, color: subColor, size: 'xs', margin: 'xs', wrap: true } : null,
    ].filter(Boolean), // 🔥 ล้างค่า null ทิ้งก่อนส่ง
  };
}

function bubble({ title, subtitle, color, body, altText }) {
  return {
    type: 'flex',
    altText: altText || title,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header(title, subtitle, color),
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.soft,
        paddingAll: 'md',
        spacing: 'sm',
        contents: body.filter(Boolean), // 🔥 ล้างค่า null ทิ้ง
      },
    },
  };
}

function emptyFlex({ title, subtitle, message, color = COLORS.amber }) {
  return bubble({
    title,
    subtitle,
    color,
    altText: title,
    body: [
      panel([
        { type: 'text', text: message || 'ไม่พบข้อมูลในช่วงวันที่นี้', color: COLORS.ink, size: 'sm', align: 'center', wrap: true },
      ], { margin: 'md' }),
    ],
  });
}

function employeeScheduleFlex({ employee, schedules, startDate, endDate, branchFilter }) {
  const shown = schedules.slice(0, 24);
  const hiddenCount = Math.max(0, schedules.length - shown.length);
  const workDateSet = new Set(schedules.filter((item) => !item.is_off).map((item) => item.work_date));
  const workCount = workDateSet.size;
  const offDates = eachDate(startDate, endDate).filter((date) => !workDateSet.has(date));
  const title = `ตารางคุณ ${getDisplayName(employee)}`;
  const subtitle = branchFilter
    ? `${dateRangeText(startDate, endDate)} • เฉพาะ ${branchText(branchFilter)}`
    : dateRangeText(startDate, endDate);

  return bubble({
    title,
    subtitle,
    color: COLORS.teal,
    altText: title,
    body: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        margin: 'xs',
        contents: [
          stat('เข้างาน', workCount, COLORS.teal),
          stat('วันหยุด', offDates.length, COLORS.amber),
        ],
      },
      offDates.length > 0 ? panel([
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'วันหยุด', color: COLORS.amber, size: 'sm', weight: 'bold', flex: 4 },
            { type: 'text', text: `${offDates.length} วัน`, color: COLORS.amber, size: 'sm', weight: 'bold', align: 'end', flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FFFBEB',
          cornerRadius: 'md',
          paddingAll: 'sm',
          margin: 'sm',
          contents: [
            { type: 'text', text: missingDatesText(offDates, startDate, endDate), color: COLORS.amber, size: 'xs', wrap: true },
          ],
        },
      ], { borderColor: '#FEF3C7' }) : null,
      ...shown.map((schedule) => panel([
        {
          type: 'box',
          layout: 'horizontal',
          // 🛠️ แก้ไข: LINE Box ไม่รองรับ "alignment" นำออกเพื่อความปลอดภัย
          contents: [
            { type: 'text', text: scheduleDateText(schedule.work_date), color: COLORS.ink, size: 'sm', weight: 'bold', flex: 5 },
            { type: 'text', text: shiftText(schedule), color: schedule.is_off ? COLORS.amber : COLORS.blue, size: 'sm', weight: 'bold', align: 'end', flex: 5, wrap: true },
          ],
        },
        { 
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          spacing: 'xs',
          contents: [
            // ใช้ความกว้าง flex: 0 เป็นตัวบอกให้ยืดหยุ่นตามเนื้อหาอักษร
            { type: 'text', text: '•', color: schedule.is_off ? COLORS.amber : COLORS.teal, size: 'sm', weight: 'bold', flex: 0 },
            { type: 'text', text: schedule.is_off ? 'หยุดประจำสัปดาห์' : branchText(schedule.branches), color: COLORS.muted, size: 'xs', wrap: true, flex: 1 },
          ]
        },
        schedule.note ? { type: 'text', text: `📝 ${schedule.note}`, color: COLORS.muted, size: 'xxs', margin: 'xs', wrap: true } : null,
      ].filter(Boolean))),
      
      hiddenCount ? panel([
        { type: 'text', text: `⏳ ยังมีอีก ${hiddenCount} รายการ (เลือกช่วงเวลาให้สั้นลง)`, color: COLORS.amber, size: 'xs', align: 'center', weight: 'bold', wrap: true },
      ], { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }) : null,
    ].filter(Boolean),
  });
}

function groupBranchSchedules(schedules) {
  const byDate = new Map();
  for (const schedule of schedules) {
    if (!byDate.has(schedule.work_date)) byDate.set(schedule.work_date, []);
    byDate.get(schedule.work_date).push(schedule);
  }
  return Array.from(byDate.entries()).map(([date, items]) => ({ date, items }));
}

function branchScheduleFlex({ branch, schedules, startDate, endDate }) {
  const groups = groupBranchSchedules(schedules.filter((item) => !item.is_off));
  const shown = groups.slice(0, 24);
  const hiddenCount = Math.max(0, groups.length - shown.length);
  const employeeCount = new Set(schedules.filter((item) => !item.is_off).map((item) => item.employee_id)).size;
  const title = `ตารางสาขา ${branch.code || branch.name}`;
  const subtitle = dateRangeText(startDate, endDate);

  if (groups.length === 0) {
    return emptyFlex({
      title,
      subtitle,
      message: 'ยังไม่มีคนลงตารางในสาขานี้',
      color: COLORS.blue,
    });
  }

  return bubble({
    title,
    subtitle,
    color: COLORS.blue,
    altText: title,
    body: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        margin: 'xs',
        contents: [
          stat('รวมเปิดร้าน (วัน)', groups.length, COLORS.blue),
          stat('พนักงานทั้งหมด (คน)', employeeCount, COLORS.teal),
        ],
      },
      ...shown.map(({ date, items }) => panel([
        { type: 'text', text: scheduleDateText(date), color: COLORS.ink, size: 'sm', weight: 'bold', margin: 'xs' },
        { type: 'separator', color: COLORS.line, margin: 'sm' }, 
        ...items.slice(0, 5).map((schedule) => ({
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: `👤 ${getDisplayName(schedule.employees, schedule.employee_id)}`, color: COLORS.ink, size: 'sm', flex: 5, wrap: true },
            { type: 'text', text: shiftText(schedule), color: COLORS.blue, size: 'xs', weight: 'bold', align: 'end', flex: 5, wrap: true },
          ],
        })),
        items.length > 5 ? { type: 'text', text: `➕ พนักงานคนอื่นอีก ${items.length - 5} คน`, color: COLORS.muted, size: 'xxs', align: 'end', margin: 'xs' } : null,
      ].filter(Boolean))),
      
      hiddenCount ? panel([
        { type: 'text', text: `⏳ ยังมีอีก ${hiddenCount} วัน (เลือกช่วงเวลาให้สั้นลง)`, color: COLORS.amber, size: 'xs', align: 'center', weight: 'bold', wrap: true },
      ], { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }) : null,
    ].filter(Boolean),
  });
}

function missingScheduleFlex({ items, startDate, endDate, scopeLabel, totalMissing }) {
  const shown = items.slice(0, 18);
  const hiddenBranches = Math.max(0, items.length - shown.length);
  const title = '🚨 ตารางคนขาด';
  const subtitle = `${dateRangeText(startDate, endDate)}${scopeLabel ? ` • ${scopeLabel}` : ''}`;

  if (items.length === 0) {
    return emptyFlex({
      title,
      subtitle,
      message: 'ช่วงนี้ทุกสาขาที่ตรวจพบมีคนลงตารางครบถ้วนแล้ว',
      color: COLORS.teal,
    });
  }

  return bubble({
    title,
    subtitle,
    color: COLORS.red,
    altText: title,
    body: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        margin: 'xs',
        contents: [
          stat('สาขาที่ขาด', items.length, COLORS.red),
          stat('จำนวนวันรวม', totalMissing, COLORS.amber),
        ],
      },
      ...shown.map((item) => panel([
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `📍 ${branchText(item.branch)}`, color: COLORS.ink, size: 'sm', weight: 'bold', flex: 7, wrap: true },
            { type: 'text', text: `${item.missingDates.length} วัน`, color: COLORS.red, size: 'sm', weight: 'bold', align: 'end', flex: 3 },
          ],
        },
        { 
          type: 'box', 
          layout: 'vertical', 
          backgroundColor: '#FEF2F2', 
          cornerRadius: 'md', 
          paddingAll: 'sm', 
          margin: 'sm',
          contents: [
            { type: 'text', text: missingDatesText(item.missingDates, startDate, endDate), color: COLORS.red, size: 'xs', wrap: true }
          ]
        },
      ].filter(Boolean))),
      
      hiddenBranches ? panel([
        { type: 'text', text: `⏳ ยังมีอีก ${hiddenBranches} สาขา (เลือกช่วงเวลาให้สั้นลง)`, color: COLORS.amber, size: 'xs', align: 'center', weight: 'bold', wrap: true },
      ], { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }) : null,
    ].filter(Boolean),
  });
}

function ambiguousFlex({ query, branches = [], employees = [] }) {
  const choices = [
    ...branches.map((branch) => `📍 สาขา: ${branchText(branch)}`),
    ...employees.map((employee) => `👤 พนักงาน: ${getDisplayName(employee)} (${employee.id})`),
  ].slice(0, 8);

  return bubble({
    title: '🔍 พบข้อมูลหลายรายการ',
    subtitle: `คำค้นหา: "${query}"`,
    color: COLORS.amber,
    altText: 'พบหลายรายการ',
    body: [
      panel([
        { type: 'text', text: '💡 โปรดระบุชื่อหรือรหัสให้เฉพาะเจาะจงยิ่งขึ้น:', color: COLORS.ink, size: 'sm', weight: 'bold', wrap: true },
        { type: 'separator', color: COLORS.line, margin: 'md' },
        ...choices.map((choice) => ({ type: 'text', text: choice, color: COLORS.muted, size: 'sm', margin: 'md', wrap: true })),
      ], { margin: 'xs' }),
    ],
  });
}

module.exports = {
  employeeScheduleFlex,
  branchScheduleFlex,
  missingScheduleFlex,
  ambiguousFlex,
  emptyFlex,
};
