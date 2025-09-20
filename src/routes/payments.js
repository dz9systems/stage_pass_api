const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { getTheaterById } = require("../db");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Create PaymentIntent on the connected account (Direct charge)
router.post("/create-intent", async (req, res) => {
  try {
    const { theaterId, amountCents, currency = "usd", orderId } = req.body;
    if (!theaterId) return res.status(400).json({ error: "Missing theaterId" });
    if (amountCents == null) return res.status(400).json({ error: "Missing amountCents" });

    const theater = await getTheaterById(theaterId);
    if (!theater?.stripeAccountId)
      return res.status(404).json({ error: "Theater not found" });

    const pi = await stripe.paymentIntents.create(
      {
        amount: Number(amountCents),
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: { theaterId, orderId: orderId || "" },
        // NOTE: no application_fee_amount → you take $0 on tickets
      },
      { stripeAccount: theater.stripeAccountId } // key for Direct charge
    );

    res.json({ clientSecret: pi.client_secret });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
