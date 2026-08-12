const { ADMIN_ROLES } = require("../config/adminPermissions");

function adminAuth(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const role = req.user.role || "user";

    if (!ADMIN_ROLES.includes(role) || req.user.adminDisabled === true || req.user.frozen === true) {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      error: "Admin authorization failed",
    });
  }
}

module.exports = adminAuth;
