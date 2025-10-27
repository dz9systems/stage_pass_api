const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { VenuesController, UsersController, SubscriptionsController } = require("../controllers");

// Initialize Stripe with proper error handling
let stripe;
try {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
} catch (error) {
  console.error("Failed to initialize Stripe:", error.message);
  // Create a mock Stripe instance for development
  stripe = {
    paymentIntents: {
      create: () => Promise.reject(new Error("Stripe not configured")),
      retrieve: () => Promise.reject(new Error("Stripe not configured")),
      confirm: () => Promise.reject(new Error("Stripe not configured")),
    },
    accounts: {
      retrieve: () => Promise.reject(new Error("Stripe not configured")),
    }
  };
}

// Create PaymentIntent on the connected account (Direct charge)
router.post("/create-intent", async (req, res) => {
  try {
    console.log("🔍 Payment intent request body:", req.body);
    const { theaterId, amountCents, currency = "usd", orderId } = req.body;

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
    const pi = await stripe.paymentIntents.create({
      amount: Number(amountCents),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { theaterId, orderId: orderId || "" },
      transfer_data: {
        destination: seller.stripeAccountId,
      },
    });

    console.log("✅ PaymentIntent created successfully");
    res.json({ 
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      stripeAccountId: seller.stripeAccountId
    });
  } catch (e) {
    console.error("❌ PaymentIntent creation failed:", e);
    res.status(500).json({ error: e.message });
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

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: plan.stripePriceId }],
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

module.exports = router;
