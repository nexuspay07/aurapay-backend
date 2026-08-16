const mongoose = require("mongoose");
const { validateTestDatabaseUri } = require("./testDatabaseSafety");

async function connectDatabase() {
  try {
    const uri = process.env.NODE_ENV === "test" ? validateTestDatabaseUri().uri : process.env.MONGO_URI;
    await mongoose.connect(uri);

    console.log(
      "✅ MongoDB Connected"
    );
  } catch (err) {
    console.error(
      "❌ MongoDB Connection Failed"
    );

    console.error(err);

    process.exit(1);
  }
}

module.exports =
  connectDatabase;
