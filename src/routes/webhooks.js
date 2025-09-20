const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Use express.raw ONLY on this route
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const connectedAccount = event.account || "platform";

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log("✅ Payment succeeded", connectedAccount, pi.id, pi.metadata);
        // TODO: mark orderId paid, issue QR/seat code
        break;
      }
      case "charge.dispute.created": {
        console.log("⚠️ Dispute created", connectedAccount);
        // TODO: notify theater to upload evidence
        break;
      }
      case "account.updated": {
        console.log("ℹ️ Account updated", connectedAccount);
        break;
      }
      default:
        // console.log("Unhandled:", event.type);
        break;
    }

    res.sendStatus(200);
  }
);

module.exports = router;
