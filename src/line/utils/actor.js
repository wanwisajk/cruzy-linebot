const employeeRepo = require('../../../backend/repositories/employee.repo');
const userRepo = require('../../../backend/repositories/user.repo');
const { getDisplayName } = require('./displayName');

async function resolveLineActor(lineUserId) {
  if (!lineUserId) return null;

  const employee = await employeeRepo.findByLineUserId(lineUserId);
  const user = await userRepo.findByLineUserId(lineUserId);
  const employeeFromUser = !employee && user ? await employeeRepo.findByUserIdentity(user) : null;
  const resolvedEmployee = employee || employeeFromUser;

  const name = getDisplayName(resolvedEmployee, user, lineUserId);

  return {
    employee: resolvedEmployee,
    lineEmployee: employee,
    employeeResolvedBy: employee ? 'line_user_id' : employeeFromUser ? 'user_identity' : null,
    user,
    type: user ? 'user' : resolvedEmployee ? 'employee' : null,
    id: user ? user.id : resolvedEmployee ? resolvedEmployee.id : null,
    name,
  };
}

module.exports = {
  resolveLineActor,
};
