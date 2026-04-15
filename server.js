require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// 🔥 MIDDLEWARE
app.use(express.json());

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://aurapay-dashboard.vercel.app",
    "https://aurapay-dashboard-3gjugergf-nexuspay07-5796s-projects.vercel.app"
  ],
  credentials: true,
}));

// 🔌 LOAD ROUTES
console.log("🔌 Loading routes...");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");

// ✅ MOUNT ROUTES (clean structure)
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/payments", paymentRoutes);
app.use("/wallet", walletRoutes);

console.log("✅ Routes loaded");

// 🔗 DB CONNECT
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// 🏠 ROOT ROUTE
app.get("/", (req, res) => {
  res.send("🚀 AuraPay API is running");
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});