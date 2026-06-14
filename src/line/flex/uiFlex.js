const COLORS = {
  ink: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
  teal: '#0F766E',
};

function row(label, value, color = COLORS.ink) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: COLORS.muted, size: 'sm', flex: 4, wrap: true },
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
    borderWidth: '1px',
    cornerRadius: 'md',
    paddingAll: 'md',
    spacing: 'sm',
    margin: options.margin,
    contents,
  };
}

function totalCard(label, value, color = COLORS.teal) {
  return card([
    { type: 'text', text: label, color, size: 'xs', weight: 'bold' },
    { type: 'text', text: String(value || '-'), align: 'end', weight: 'bold', size: 'xl', color, margin: 'xs' },
  ], { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', margin: 'sm' });
}

function bubble({ title, subtitle, color = COLORS.ink, body = [], footer, altText }) {
  return {
    type: 'flex',
    altText: altText || title || 'แจ้งเตือน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title || 'แจ้งเตือน', color: COLORS.white, weight: 'bold', size: 'lg', wrap: true },
          subtitle ? { type: 'text', text: subtitle, color: '#E0F2FE', size: 'xs', margin: 'xs', wrap: true } : null,
        ].filter(Boolean),
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: COLORS.surface,
        contents: body,
      },
      footer,
    },
  };
}

function primaryButton(label, action, color = COLORS.success) {
  return { type: 'button', style: 'primary', color, action };
}

function secondaryButton(label, action) {
  return { type: 'button', style: 'secondary', action };
}

function resultFlex({ title, subtitle, statusLabel, statusColor, rows, altText }) {
  return bubble({
    title,
    subtitle,
    color: statusColor,
    altText,
    body: [
      card([
        ...(rows || []),
        row('สถานะ', statusLabel, statusColor),
      ]),
    ],
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
