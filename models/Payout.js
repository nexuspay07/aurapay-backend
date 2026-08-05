const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
{
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
        index: true,
    },

    settlements: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Settlement",
    }],

    grossAmount: {
        type: Number,
        required: true,
    },

    netAmount: {
        type: Number,
        required: true,
    },

    currency: {
        type: String,
        required: true,
        lowercase: true,
    },

    status: {
        type: String,
        enum: [
            "pending",
            "processing",
            "completed",
            "failed",
        ],
        default: "pending",
    },

    payoutReference: {
        type: String,
        default: null,
    },

    processedAt: {
        type: Date,
        default: null,
    },

    notes: {
        type: String,
        default: "",
    },

},
{
    timestamps: true,
});

module.exports =
    mongoose.model(
        "Payout",
        payoutSchema
    );