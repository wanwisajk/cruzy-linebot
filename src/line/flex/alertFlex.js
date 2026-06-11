function alertFlex({ title, body, severity }) {
  const danger = severity === 'danger' || severity === 'error';
  const color = danger ? '#B91C1C' : '#D97706';

  return {
    type: 'flex',
    altText: title || 'แจ้งเตือน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: title || 'แจ้งเตือน', color: '#FFFFFF', weight: 'bold', size: 'lg', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: danger ? '#FEF2F2' : '#FFFBEB',
        contents: String(body || '')
          .split('\n')
          .filter(Boolean)
          .map((line) => ({ type: 'text', text: line, color: '#111827', size: 'sm', wrap: true })),
      },
    },
  };
}

module.exports = alertFlex;
