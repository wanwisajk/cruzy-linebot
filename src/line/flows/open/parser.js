function parseOpenEvent(event) {
  // event.message may be text or image
  const hasImage = event.message && (event.message.type === 'image' || event.message.type === 'file');
  const messageId = event.message && event.message.id;
  const text = event.message && event.message.type === 'text' ? event.message.text : '';

  return {
    hasImage,
    messageId,
    text,
  };
}

module.exports = {
  parseOpenEvent,
};
