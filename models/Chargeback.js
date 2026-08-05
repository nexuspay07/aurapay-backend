const mongoose = require("mongoose");

const chargebackSchema = new mongoose.Schema({

  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Merchant",
    required: true,
  },

  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
    required: true,
  },

  provider: {
    type: String,
    required: true,
  },

  providerChargebackId: {
    type: String,
    required: true,
    unique: true,
  },

  amount: {
    type: Number,
    required: true,
  },

  currency: {
    type: String,
    required: true,
  },

  reason: {
    type: String,
    default: null,
  },

  status: {
    type: String,
    enum: [
      "open",
      "under_review",
      "won",
      "lost",
    ],
    default: "open",
  },

}, {

  timestamps: true,

});

module.exports =
  mongoose.model(
    "Chargeback",
    chargebackSchema
  );