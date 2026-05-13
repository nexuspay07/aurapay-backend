function adminAuth(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const role = req.user.role || "user";

    if (!["admin", "super_admin"].includes(role)) {
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