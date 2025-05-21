// ✅ helpers/permissions.js
exports.hasRight = function (userPermissions, permissionName, action = 'view') {
  return (
    userPermissions &&
    userPermissions[permissionName] &&
    userPermissions[permissionName][action] === true
  );
};
