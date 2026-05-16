module.exports = function permissions(allowedRoles = []) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: "Insufficient permissions",
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