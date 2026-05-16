module.exports = function permission(requiredPermission) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      const permissions =
        req.user.permissions || [];

      if (
        !permissions.includes(requiredPermission)
      ) {
        return res.status(403).json({
          error: "Permission denied",
        });
      }

      next();
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };
};