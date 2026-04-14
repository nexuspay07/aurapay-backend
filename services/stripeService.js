const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_KEY);

async function payWithStripe(data) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: data.amount * 100,
      currency: data.currency,
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });
    return { success: true, provider: "Stripe", id: paymentIntent.id, status: paymentIntent.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { payWithStripe };