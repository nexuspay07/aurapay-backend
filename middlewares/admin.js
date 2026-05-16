module.exports = function (req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const adminRoles = [
      "super_admin",
      "finance_admin",
      "risk_admin",
      "support_admin",
      "auditor",
    ];

    if (!adminRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    next();
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};