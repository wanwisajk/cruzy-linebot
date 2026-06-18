const COLORS = {
  ink: '#1E293B',
  muted: '#64748B',
  border: '#F1F5F9',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  success: '#10B981',
  danger: '#F43F5E',
  warning: '#F59E0B',
  info: '#3B82F6',
  teal: '#0D9488',
};

function row(label, value, color = COLORS.ink) {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, color: COLORS.muted, size: 'xs', flex: 4, wrap: true },
      { type: 'text', text: String(value || '-'), color, size: 'sm', weight: 'bold', align: 'end', flex: 6, wrap: true },
    ],
  };
}

function card(contents, options = {}) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: options.backgroundColor || COLORS.white,
    borderColor: options.borderColor || COLORS.border,
    borderWidth: options.borderColor ? '1px' : '0px',
    cornerRadius: 'xl',
    paddingAll: options.paddingAll || 'lg',
    spacing: options.spacing || 'md',
    margin: options.margin,
    contents,
  };
}

function totalCard(label, value, color = COLORS.teal) {
  return card([
    { type: 'text', text: label, color: COLORS.muted, size: 'xs', weight: 'bold' }, 
    { type: 'text', text: String(value || '-'), align: 'end', weight: 'bold', size: 'xxl', color, margin: 'xs' },
  ], { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7', margin: 'md' });
}
function bubble({ title, subtitle, color = COLORS.ink, body = [], footer, altText }) {
  return {
    type: 'flex',
    altText: altText || title || 'แจ้งเตือน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'xl',
        contents: [
          { type: 'text', text: title || 'แจ้งเตือน', color: COLORS.white, weight: 'bold', size: 'xl', wrap: true },
          // แก้ไขตรงนี้: เอา alpha: '80%' ออก แล้วใช้สีขาวงาช้างหรือสีเทาอ่อนที่ปลอดภัย เช่น #F1F5F9 แทน เพื่อให้ดูซอฟต์ลง
          subtitle ? { type: 'text', text: subtitle, color: '#F1F5F9', size: 'xs', margin: 'xs', wrap: true } : null,
        ].filter(Boolean),
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        backgroundColor: COLORS.surface,
        paddingAll: 'xl',
        contents: body,
      },
      footer: footer ? {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: COLORS.white,
        paddingAll: 'lg',
        contents: Array.isArray(footer.contents) ? footer.contents : [footer],
      } : undefined,
    },
  };
}
function primaryButton(label, action, color = COLORS.success) {
  return {
    type: 'box',
    layout: 'vertical',
    cornerRadius: 'md', // ✨ กำหนดความโค้งมนที่ตัวกล่องครอบ (xs, sm, md, lg, xl, xxl)
    flex: 1,
    contents: [
      {
        type: 'button',
        style: 'primary',
        color,
        action: { ...(action || {}), label: action && action.label ? action.label : label },
        height: 'sm',
      }
    ]
  };
}

function secondaryButton(label, action) {
  return { 
    type: 'box',
    layout: 'vertical',
    cornerRadius: 'md', // ✨ กำหนดความโค้งมนที่ตัวกล่องครอบเช่นกัน
    flex: 1,
    contents: [
      {
        type: 'button',
        style: 'secondary',
        action: { ...(action || {}), label: action && action.label ? action.label : label },
        height: 'sm',
      }
    ]
  };
}

function resultFlex({ title, subtitle, statusLabel, statusColor, rows, altText, footer }) {
  const statusBadge = {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: statusColor === COLORS.success || statusColor === '#16A34A' || statusColor === '#10B981' ? '#E6F4EA' : '#FCE8E6',
    paddingAll: 'sm',
    cornerRadius: 'md',
    margin: 'md',
    contents: [
      { type: 'text', text: statusLabel || 'ดำเนินการเสร็จสิ้น', color: statusColor, weight: 'bold', size: 'sm', align: 'center' }
    ]
  };

  return bubble({
    title,
    subtitle,
    color: statusColor,
    altText,
    body: [
      statusBadge,
      card([
        ...(rows || []),
      ], { backgroundColor: COLORS.white, margin: 'xs' }),
    ],
    footer,
  });
}

module.exports = {
  COLORS,
  row,
  card,
  totalCard,
  bubble,
  primaryButton,
  secondaryButton,
  resultFlex,
};
