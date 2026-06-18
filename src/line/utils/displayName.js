function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function collectDisplayCandidates(value) {
  if (!isPresent(value)) return [];

  if (typeof value !== 'object') {
    return [value];
  }

  return [
    value.nickname,
    value.name,
    value.username,
    value.line_user_id,
    value.lineUserId,
  ];
}

function getDisplayName(...values) {
  const candidates = values.flatMap(collectDisplayCandidates);
  const found = candidates.find(isPresent);
  return found ? String(found).trim() : '-';
}

module.exports = {
  getDisplayName,
};
