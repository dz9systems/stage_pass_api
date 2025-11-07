const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { VenuesController, UsersController, SubscriptionsController } = require("../controllers");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Create PaymentIntent on the connected account (Direct charge)
router.post("/create-intent", async (req, res) => {
  try {
    console.log("🔍 Payment intent request body:", req.body);
    const { theaterId, amountCents, currency = "usd", orderId, metadata: requestMetadata } = req.body;

    // Use metadata from request if provided, otherwise build from individual fields
    // This allows frontend to send full metadata object or just individual fields
    const metadata = requestMetadata || { theaterId, orderId: orderId || "" };

    // Ensure orderId is in metadata even if not in top-level request
    if (!metadata.orderId && orderId) {
      metadata.orderId = orderId;
    }

    // Ensure theaterId is in metadata
    if (!metadata.theaterId && theaterId) {
      metadata.theaterId = theaterId;
    }

    console.log("📦 PaymentIntent metadata:", metadata);

    if (!metadata.orderId) {
      console.warn(
        "⚠️ No orderId provided in request. Webhook can't update order status or send emails without metadata.orderId."
      );
    } else {
      console.log("🔗 Linking PaymentIntent to orderId:", metadata.orderId);
    }

    if (!theaterId) {
      console.log("❌ Missing theaterId");
      return res.status(400).json({ error: "Missing theaterId" });
    }
    if (amountCents == null) {
      console.log("❌ Missing amountCents");
      return res.status(400).json({ error: "Missing amountCents" });
    }

    console.log("🔍 Looking up venue:", theaterId);
    const venues = await VenuesController.getVenuesBySellerId(theaterId);
    console.log("🔍 Venues found:", venues ? venues.length : 0);

    if (!venues || venues.length === 0) {
      console.log("❌ No venues found for seller");
      return res.status(404).json({ error: "No venues found for seller" });
    }

    // Use the first venue (or you might want to handle multiple venues differently)
    const venue = venues[0];

    console.log("🔍 Looking up seller:", venue.sellerId);
    const seller = await UsersController.getUserById(venue.sellerId);
    console.log("🔍 Seller found:", seller ? "Yes" : "No");
    console.log("🔍 Seller data:", seller);
    console.log("🔍 Seller stripeAccountId:", seller?.stripeAccountId);

    if (!seller?.stripeAccountId) {
      console.log("❌ Seller not found or no Stripe account");
      return res.status(404).json({ error: "Seller not found or not connected to Stripe" });
    }

    // Create PaymentIntent on main account and transfer full amount to seller
    // No transaction fees - theaters pay monthly subscription instead
    // For Direct Charges (transfer_data), use explicit payment_method_types for better compatibility
    const pi = await stripe.paymentIntents.create({
      amount: Number(amountCents),
      currency,
      payment_method_types: ['card'], // Explicitly specify card for connected accounts
      metadata: metadata,
      transfer_data: {
        destination: seller.stripeAccountId,
      },
    });

    console.log(
      "✅ PaymentIntent created successfully",
      {
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        transfer_destination: pi.transfer_data && pi.transfer_data.destination,
        metadata: pi.metadata
      }
    );
    console.log(
      `⚠️ PaymentIntent status: ${pi.status}. Webhook will only fire when status becomes 'succeeded' after payment confirmation.`
    );
    res.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      stripeAccountId: seller.stripeAccountId,
      warning: !metadata.orderId ? "No orderId in metadata; webhook will not update order or send receipt" : undefined
    });
  } catch (e) {
    console.error("❌ PaymentIntent creation failed:", {
      message: e.message,
      type: e.type,
      code: e.code,
      decline_code: e.decline_code,
      param: e.param,
      statusCode: e.statusCode,
      raw: e.raw,
      requestId: e.requestId
    });
    res.status(500).json({
      error: e.message,
      type: e.type,
      code: e.code,
      details: e.raw || e
    });
  }
});

// Cancel PaymentIntent
router.post("/cancel-payment-intent", async (req, res) => {
  try {
    console.log("🔍 Cancel PaymentIntent request:", req.body);
    const { paymentIntentId, stripeAccountId } = req.body;

    if (!paymentIntentId) {
      console.log("❌ Missing paymentIntentId");
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    // Cancel the PaymentIntent on the correct account
    const cancelOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};

    try {
      const canceledPi = await stripe.paymentIntents.cancel(paymentIntentId, cancelOptions);
      console.log("✅ PaymentIntent canceled successfully:", canceledPi.id);
      res.json({
        success: true,
        paymentIntentId: canceledPi.id,
        status: canceledPi.status
      });
    } catch (cancelError) {
      // If PaymentIntent doesn't exist or is already canceled/completed, that's okay
      if (cancelError.code === 'resource_missing' ||
          cancelError.message?.includes('No such payment_intent') ||
          cancelError.message?.includes('already canceled') ||
          cancelError.message?.includes('already succeeded')) {
        console.log("ℹ️ PaymentIntent already canceled/completed or doesn't exist:", paymentIntentId);
        res.json({
          success: true,
          paymentIntentId: paymentIntentId,
          status: 'already_handled',
          message: 'PaymentIntent was already handled'
        });
      } else {
        throw cancelError; // Re-throw other errors
      }
    }
  } catch (e) {
    console.error("❌ PaymentIntent cancellation failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Confirm PaymentIntent (for connected accounts)
router.post("/confirm-payment-intent", async (req, res) => {
  try {
    console.log("🔍 Confirm PaymentIntent request:", req.body);
    const { paymentIntentId, stripeAccountId, cardToken } = req.body;

    if (!paymentIntentId) {
      console.log("❌ Missing paymentIntentId");
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    if (!stripeAccountId) {
      console.log("❌ Missing stripeAccountId");
      return res.status(400).json({ error: "Missing stripeAccountId" });
    }

    if (!cardToken) {
      console.log("❌ Missing cardToken");
      return res.status(400).json({ error: "Missing cardToken" });
    }

    // Create PaymentMethod on the connected account
    console.log("🔍 Creating PaymentMethod on connected account...");
    const paymentMethod = await stripe.paymentMethods.create(
      {
        type: 'card',
        card: { token: cardToken },
      },
      { stripeAccount: stripeAccountId }
    );

    console.log("✅ PaymentMethod created on connected account:", paymentMethod.id);

    // Confirm the PaymentIntent on the correct account
    const confirmedPi = await stripe.paymentIntents.confirm(
      paymentIntentId,
      {
        payment_method: paymentMethod.id,
      },
      { stripeAccount: stripeAccountId }
    );

    console.log("✅ PaymentIntent confirmed successfully:", confirmedPi.id);
    res.json({
      success: true,
      paymentIntentId: confirmedPi.id,
      status: confirmedPi.status,
      clientSecret: confirmedPi.client_secret
    });
  } catch (e) {
    console.error("❌ PaymentIntent confirmation failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create Stripe subscription
router.post("/create-subscription", async (req, res) => {
  try {
    console.log("🔍 Create subscription request:", req.body);
    const { userId, planId, paymentMethodId, customerId } = req.body;

    // Validation
    if (!userId || !planId || !paymentMethodId) {
      return res.status(400).json({
        error: "userId, planId, and paymentMethodId are required"
      });
    }

    // Get the subscription plan
    const plan = await SubscriptionsController.getSubscriptionPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }

    // Check if plan has Stripe price ID
    if (!plan.stripePriceId) {
      return res.status(400).json({
        error: "Subscription plan is not configured for Stripe billing"
      });
    }

    // Clean up stripePriceId - handle JSON stringified values
    let stripePriceId = plan.stripePriceId;
    if (typeof stripePriceId === 'string') {
      // Try to parse if it's a JSON string
      try {
        const parsed = JSON.parse(stripePriceId);
        if (typeof parsed === 'string') {
          stripePriceId = parsed;
        }
      } catch (e) {
        // Not JSON, just remove surrounding quotes if present
        stripePriceId = stripePriceId.replace(/^["']|["']$/g, '');
      }
    }

    // Get or create Stripe customer
    let customer;
    if (customerId) {
      customer = await stripe.customers.retrieve(customerId);
    } else {
      // Get user data to create customer
      const user = await UsersController.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName || user.email,
        metadata: { userId }
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    console.log('plan.stripePriceId (original):', plan.stripePriceId);
    console.log('stripePriceId (cleaned):', stripePriceId);

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId,
        planId,
        planName: plan.name
      }
    });

    console.log("✅ Stripe subscription created:", subscription.id);
    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      customerId: customer.id,
      status: subscription.status
    });

  } catch (e) {
    console.error("❌ Stripe subscription creation failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Complete Stripe subscription (after payment confirmation)
router.post("/complete-subscription", async (req, res) => {
  try {
    console.log("🔍 Complete subscription request:", req.body);
    const { subscriptionId, userId } = req.body;

    if (!subscriptionId || !userId) {
      return res.status(400).json({
        error: "subscriptionId and userId are required"
      });
    }

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.status !== 'active') {
      return res.status(400).json({
        error: `Subscription is not active. Current status: ${subscription.status}`
      });
    }

    // Get plan info from metadata
    const planId = subscription.metadata.planId;
    const planName = subscription.metadata.planName;

    if (!planId) {
      return res.status(400).json({
        error: "Subscription metadata missing planId"
      });
    }

    // Create local subscription record
    const localSubscription = {
      userId,
      planId,
      planName,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: subscription.customer,
      status: 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    };

    const result = await SubscriptionsController.upsertUserSubscription(userId, localSubscription);

    console.log("✅ Local subscription created/updated:", result.id);
    res.json({
      success: true,
      subscription: result,
      stripeSubscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end
      }
    });

  } catch (e) {
    console.error("❌ Subscription completion failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Cancel Stripe subscription
router.post("/cancel-subscription", async (req, res) => {
  try {
    console.log("🔍 Cancel subscription request:", req.body);
    const { subscriptionId, userId, cancelAtPeriodEnd = true } = req.body;

    if (!subscriptionId || !userId) {
      return res.status(400).json({
        error: "subscriptionId and userId are required"
      });
    }

    // Cancel subscription in Stripe
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd
    });

    // Update local subscription
    const localSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
    if (localSubscription) {
      await SubscriptionsController.upsertUserSubscription(userId, {
        ...localSubscription,
        cancelAtPeriodEnd: cancelAtPeriodEnd,
        status: cancelAtPeriodEnd ? 'active' : 'canceled'
      });
    }

    console.log("✅ Subscription cancellation processed:", subscriptionId);
    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
    });

  } catch (e) {
    console.error("❌ Subscription cancellation failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get subscription status
router.get("/subscription/:subscriptionId", async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    res.json({
      id: subscription.id,
      status: subscription.status,
      customer: subscription.customer,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at,
      items: subscription.items.data.map(item => ({
        price: item.price.id,
        product: item.price.product,
        unitAmount: item.price.unit_amount,
        currency: item.price.currency
      })),
      metadata: subscription.metadata
    });

  } catch (e) {
    console.error("❌ Failed to get subscription:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get PaymentIntent status (for debugging)
router.get("/payment-intent/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    console.log(`🔍 PaymentIntent status check:`, {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      metadata: pi.metadata,
      created: new Date(pi.created * 1000).toISOString()
    });

    res.json({
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      currency: pi.currency,
      metadata: pi.metadata,
      created: new Date(pi.created * 1000).toISOString(),
      lastPaymentError: pi.last_payment_error,
      charges: pi.charges?.data || []
    });
  } catch (e) {
    console.error("❌ Failed to get PaymentIntent:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
