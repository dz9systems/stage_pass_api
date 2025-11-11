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
    const { 
      sellerId,  // Frontend sends sellerId (not theaterId)
      theaterId, // Keep for backward compatibility
      amountCents, 
      currency = "usd", 
      orderId, 
      baseUrl, 
      // Frontend can send these directly or in metadata
      productionId,
      performanceId,
      customerEmail,
      venueName,
      venueAddress,
      venueCity,
      venueState,
      venueZipCode,
      performanceDate,
      performanceTime,
      tickets, // Tickets array (will be stringified for Stripe metadata)
      metadata: requestMetadata 
    } = req.body;

    // Use metadata from request if provided, otherwise build from individual fields
    // This allows frontend to send full metadata object or just individual fields
    const metadata = requestMetadata || { 
      sellerId: sellerId || theaterId, // Use sellerId, fallback to theaterId for backward compat
      orderId: orderId || "" 
    };

    // Ensure orderId is in metadata even if not in top-level request
    if (!metadata.orderId && orderId) {
      metadata.orderId = orderId;
    }

    // Ensure sellerId is in metadata (frontend sends sellerId, not theaterId)
    if (!metadata.sellerId) {
      metadata.sellerId = sellerId || theaterId;
    }

    // Add baseUrl to metadata if provided (for QR code generation in emails)
    // Frontend can send this to use localhost in dev, production URL in prod
    if (baseUrl) {
      metadata.baseUrl = baseUrl;
    }

    // Add production and performance IDs if provided
    if (productionId && !metadata.productionId) {
      metadata.productionId = productionId;
    }
    if (performanceId && !metadata.performanceId) {
      metadata.performanceId = performanceId;
    }

    // Add customer email if provided
    if (customerEmail && !metadata.customerEmail) {
      metadata.customerEmail = customerEmail;
    }

    // Add venue/location data if provided from frontend (separate fields)
    if (venueName && !metadata.venueName) {
      metadata.venueName = venueName;
    }
    if (venueAddress && !metadata.venueAddress) {
      metadata.venueAddress = venueAddress;
    }
    if (venueCity && !metadata.venueCity) {
      metadata.venueCity = venueCity;
    }
    if (venueState && !metadata.venueState) {
      metadata.venueState = venueState;
    }
    if (venueZipCode && !metadata.venueZipCode) {
      metadata.venueZipCode = venueZipCode;
    }

    // Add performance date/time if provided from frontend
    if (performanceDate && !metadata.performanceDate) {
      metadata.performanceDate = performanceDate;
    }
    if (performanceTime && !metadata.performanceTime) {
      metadata.performanceTime = performanceTime;
    }

    // Add tickets data if provided (must be stringified for Stripe metadata)
    // Frontend should send tickets as array, we'll stringify it for Stripe
    if (tickets && !metadata.tickets) {
      // Stringify tickets array for Stripe metadata (Stripe metadata values must be strings)
      metadata.tickets = JSON.stringify(tickets);
    }


    if (!metadata.orderId) {

    } else {
    }

    // Validate sellerId (frontend sends sellerId, not theaterId)
    const sellerIdToUse = sellerId || theaterId;
    if (!sellerIdToUse) {
      return res.status(400).json({ error: "Missing sellerId or theaterId" });
    }
    if (amountCents == null) {
      return res.status(400).json({ error: "Missing amountCents" });
    }

    const venues = await VenuesController.getVenuesBySellerId(sellerIdToUse);

    if (!venues || venues.length === 0) {
      return res.status(404).json({ error: "No venues found for seller" });
    }

    // Use the first venue (or you might want to handle multiple venues differently)
    const venue = venues[0];

    const seller = await UsersController.getUserById(venue.sellerId);

    if (!seller?.stripeAccountId) {
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


    res.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      stripeAccountId: seller.stripeAccountId,
      warning: !metadata.orderId ? "No orderId in metadata; webhook will not update order or send receipt" : undefined
    });
  } catch (e) {

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
    const { paymentIntentId, stripeAccountId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    // Cancel the PaymentIntent on the correct account
    const cancelOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};

    try {
      const canceledPi = await stripe.paymentIntents.cancel(paymentIntentId, cancelOptions);
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
    res.status(500).json({ error: e.message });
  }
});

// Confirm PaymentIntent (for connected accounts)
router.post("/confirm-payment-intent", async (req, res) => {
  try {
    const { paymentIntentId, stripeAccountId, cardToken } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing paymentIntentId" });
    }

    if (!stripeAccountId) {
      return res.status(400).json({ error: "Missing stripeAccountId" });
    }

    if (!cardToken) {
      return res.status(400).json({ error: "Missing cardToken" });
    }

    // Create PaymentMethod on the connected account
    const paymentMethod = await stripe.paymentMethods.create(
      {
        type: 'card',
        card: { token: cardToken },
      },
      { stripeAccount: stripeAccountId }
    );


    // Confirm the PaymentIntent on the correct account
    const confirmedPi = await stripe.paymentIntents.confirm(
      paymentIntentId,
      {
        payment_method: paymentMethod.id,
      },
      { stripeAccount: stripeAccountId }
    );

    res.json({
      success: true,
      paymentIntentId: confirmedPi.id,
      status: confirmedPi.status,
      clientSecret: confirmedPi.client_secret
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create Stripe subscription
router.post("/create-subscription", async (req, res) => {
  try {
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

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      customerId: customer.id,
      status: subscription.status
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Complete Stripe subscription (after payment confirmation)
router.post("/complete-subscription", async (req, res) => {
  try {
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
    res.status(500).json({ error: e.message });
  }
});

// Cancel Stripe subscription
router.post("/cancel-subscription", async (req, res) => {
  try {
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

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
    });

  } catch (e) {
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
    res.status(500).json({ error: e.message });
  }
});

// Get PaymentIntent status (for debugging)
router.get("/payment-intent/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

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
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
