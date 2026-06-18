const { formatDate, formatTime } = require('../utils/date');
const { getDisplayName } = require('../../src/line/utils/displayName');

function text(textValue) {
  return {
    type: 'text',
    text: textValue,
  };
}

function menu() {
  return {
    type: 'flex',
    altText: 'Cruzy Bot Menu',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'Cruzy Bot',
            weight: 'bold',
            size: 'xl',
            color: '#183A37',
          },
          {
            type: 'text',
            text: 'ถามข้อมูลพื้นฐานจากระบบได้ทันที',
            size: 'sm',
            color: '#5F6F6B',
            wrap: true,
          },
          command('โปรไฟล์', 'ดูข้อมูลพนักงานจาก LINE userId'),
          command('ไอดี', 'ดู LINE userId สำหรับผูกกับพนักงาน'),
          command('ตารางวันนี้', 'ดูตารางงานของวันนี้'),
          command('ตารางพรุ่งนี้', 'ดูตารางงานของวันพรุ่งนี้'),
          command('ตารางงาน', 'ดูตารางงาน 7 วันข้างหน้า'),
          command('สาขา', 'ดูรายชื่อสาขา'),
          command('พนักงาน นิดา', 'ค้นหาพนักงานด้วยชื่อ'),
        ],
      },
    },
  };
}

function profile(employee) {
  const lines = [
    ['ชื่อ', getDisplayName(employee)],
    ['ชื่อจริง', employee.name],
    ['ชื่อเล่น', employee.nickname],
    ['ตำแหน่ง', employee.position],
    ['ประเภท', employee.emp_type],
    ['โทร', employee.phone],
    ['โซน', employee.regions?.name],
  ].filter(([, value]) => value);

  return infoBubble('โปรไฟล์พนักงาน', lines);
}

function scheduleList(title, schedules) {
  const contents = schedules.slice(0, 10).map((schedule) => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      {
        type: 'text',
        text: `${formatDate(schedule.work_date)} ${schedule.is_off ? 'หยุด' : ''}`.trim(),
        weight: 'bold',
        size: 'sm',
        color: '#183A37',
      },
      {
        type: 'text',
        text: schedule.is_off
          ? 'วันหยุด'
          : `${schedule.branches?.code || '-'} ${schedule.branches?.name || ''}`,
        size: 'sm',
        color: '#334B48',
        wrap: true,
      },
      {
        type: 'text',
        text: `${formatTime(schedule.shift_start)} - ${formatTime(schedule.shift_end)}`,
        size: 'xs',
        color: '#6B7774',
      },
    ],
  }));

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
            color: '#183A37',
          },
          ...contents,
        ],
      },
    },
  };
}

function infoBubble(title, rows) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
            color: '#183A37',
          },
          ...rows.map(([label, value]) => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: label,
                size: 'sm',
                color: '#6B7774',
                flex: 2,
              },
              {
                type: 'text',
                text: String(value),
                size: 'sm',
                color: '#183A37',
                wrap: true,
                flex: 4,
              },
            ],
          })),
        ],
      },
    },
  };
}

function command(title, description) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: title,
        weight: 'bold',
        size: 'sm',
        color: '#183A37',
      },
      {
        type: 'text',
        text: description,
        size: 'xs',
        color: '#6B7774',
        wrap: true,
      },
    ],
  };
}

module.exports = {
  text,
  menu,
  profile,
  scheduleList,
};
