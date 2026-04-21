const Stripe = require("stripe");

const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;

if (!stripeKey) {
  throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_KEY in environment variables");
}

const stripe = new Stripe(stripeKey);

module.exports = stripe;