function alertFlex({ title, body }) {
  return {
    type: 'flex',
    altText: title || 'แจ้งเตือน',
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: title || 'แจ้งเตือน' },
      { type: 'text', text: body || '' }
    ] } }
  };
}

module.exports = alertFlex;
