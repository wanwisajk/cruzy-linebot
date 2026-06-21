const { getDisplayName } = require('./displayName');

function buildLineAudit({ lineUserId, lineGroupId, actor, profileName }) {
  const employee = actor && actor.employee ? actor.employee : null;
  const user = actor && actor.user ? actor.user : null;
  const name = getDisplayName(employee, user, profileName || (actor && actor.name), lineUserId);

  return {
    source: 'line',
    lineUserId: lineUserId || null,
    lineGroupId: lineGroupId || null,
    auditActorType: 'line',
    auditActorId: lineUserId || null,
    auditActorName: name || null,
  };
}

module.exports = {
  buildLineAudit,
};
