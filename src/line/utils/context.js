const branchRepo = require('../../../backend/repositories/branch.repo');

function extractBranchCode(text) {
  const match = String(text || '').match(/\b([A-Z]{2,5})\b/i);
  return match ? match[1].toUpperCase() : null;
}

async function resolveBranchFromEvent(event, text) {
  const source = event.source || {};
  if (source.groupId) {
    const branch = await branchRepo.findByLineGroupId(source.groupId);
    if (branch) return { branch, lineGroupId: source.groupId, matchedBy: 'line_group_id' };
  }

  const branchCode = extractBranchCode(text);
  if (branchCode) {
    const branch = await branchRepo.findByCode(branchCode);
    if (branch) return { branch, lineGroupId: source.groupId || null, matchedBy: 'branch_code' };
  }

  return { branch: null, lineGroupId: source.groupId || null, matchedBy: null };
}

module.exports = {
  extractBranchCode,
  resolveBranchFromEvent,
};
