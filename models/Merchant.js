const mongoose = require("mongoose");

const merchantSchema =
  new mongoose.Schema(
    {
      businessName: {
        type: String,
        required: true,
        trim: true,
      },

      legalName: {
        type: String,
        required: true,
        trim: true,
      },

      businessType: {
        type: String,
        enum: [
          "sole_proprietorship",
          "corporation",
          "partnership",
          "non_profit",
          "other",
        ],
        required: true,
      },

      merchantCategory: {
        type: String,
        default: "general",
      },

      website: {
        type: String,
        default: "",
      },

      contactEmail: {
        type: String,
        required: true,
        lowercase: true,
      },

      contactPhone: {
        type: String,
        default: "",
      },

      country: {
        type: String,
        required: true,
      },

      verificationStatus: {
        type: String,
        enum: [
          "pending",
          "under_review",
          "verified",
          "rejected",
        ],
        default: "pending",
      },

      riskLevel: {
        type: String,
        enum: [
          "low",
          "medium",
          "high",
        ],
        default: "medium",
      },

      active: {
        type: Boolean,
        default: true,
      },

      businessRegistrationNumber: {
  type: String,
  default: "",
},

taxNumber: {
  type: String,
  default: "",
},

businessAddress: {
  type: String,
  default: "",
},

ownerName: {
  type: String,
  default: "",
},

ownerEmail: {
  type: String,
  default: "",
},

kybDocuments: {
  type: [String],
  default: [],
},

kybSubmitted: {
  type: Boolean,
  default: false,
},

kybReviewedAt: {
  type: Date,
  default: null,
},

kybReviewedBy: {
  type: String,
  default: "",
},

      notes: {
        type: String,
        default: "",
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "Merchant",
    merchantSchema
  );