const mongoose = require("mongoose");

const providerStateSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    unique: true,
  },
  penalty: {
    type: Number,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ProviderState", providerStateSchema);