module.exports = function permission(requiredPermission) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      const userPermissions =
        Array.isArray(req.user.permissions)
          ? req.user.permissions
          : [];

      const userRole =
        req.user.role || null;

      const required =
        Array.isArray(requiredPermission)
          ? requiredPermission
          : [requiredPermission];

      const hasAccess =
        required.some((item) => {
          return (
            item &&
            (userPermissions.includes(item) ||
              userRole === item)
          );
        });

      if (!hasAccess) {
        return res.status(403).json({
          error: "Permission denied",
        });
      }

      next();
    } catch (err) {
      res.status(500).json({
        error: "Permission check failed",
      });
    }
  };
};
