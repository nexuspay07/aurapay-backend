function adminAuth(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const role = req.user.role || "user";

    const adminRoles = [
      "super_admin",
      "finance_admin",
      "risk_admin",
      "support_admin",
      "auditor",
    ];

    if (!adminRoles.includes(role)) {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}

module.exports = adminAuth;