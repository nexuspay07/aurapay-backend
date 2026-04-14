const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // 🔓 auto-unfreeze if freeze expired
    if (user.frozen && user.freezeUntil && new Date(user.freezeUntil) <= new Date()) {
      user.frozen = false;
      user.freezeUntil = null;
      await user.save();
    }

    req.user = user;
    next();
  } catch (err) {
    console.log("❌ Auth error:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};