function warningFlex({ level, note }) {
  return {
    type: 'flex',
    altText: 'หนังสือเตือน',
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: `หนังสือเตือน: ${level}` },
      { type: 'text', text: note }
    ] } }
  };
}

module.exports = warningFlex;
