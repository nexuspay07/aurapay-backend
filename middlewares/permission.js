const { hasPermission } = require("../config/adminPermissions");

module.exports = function permission(requiredPermission) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      if (!hasPermission(req.user, requiredPermission)) {
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
