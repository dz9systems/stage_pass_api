const express = require("express");
const router = express.Router();
const { SubscriptionsController } = require("../controllers");

// Get all subscription plans
router.get("/plans", async (req, res) => {
  try {
    
    const { isActive, limit = 100, offset = 0 } = req.query;
    
    let plans;
    if (isActive === 'true') {
      plans = await SubscriptionsController.getActiveSubscriptionPlans({ limit, offset });
    } else {
      plans = await SubscriptionsController.getAllSubscriptionPlans({}, { limit, offset });
    }
    
    // If no plans exist, initialize default plans
    if (plans.length === 0) {
      plans = await SubscriptionsController.initializeDefaultPlans();
    }
    
    res.json({ success: true, plans });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get subscription plan by ID
router.get("/plans/:planId", async (req, res) => {
  try {
    
    const { planId } = req.params;
    const plan = await SubscriptionsController.getSubscriptionPlanById(planId);
    
    if (!plan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }
    
    res.json({ success: true, plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a new subscription plan
router.post("/plans", async (req, res) => {
  try {
    
    const { name, price, ticketLimit, productionLimit, features, isActive, stripeProductId, stripePriceId } = req.body;
    
    // Validation
    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required" });
    }
    
    if (price < 0) {
      return res.status(400).json({ error: "Price must be positive" });
    }
    
    if (!Array.isArray(features)) {
      return res.status(400).json({ error: "Features must be an array" });
    }
    
    // Clean up stripePriceId if it's a JSON string
    let cleanedStripePriceId = stripePriceId;
    if (cleanedStripePriceId && typeof cleanedStripePriceId === 'string') {
      try {
        const parsed = JSON.parse(cleanedStripePriceId);
        if (typeof parsed === 'string') {
          cleanedStripePriceId = parsed;
        }
      } catch (e) {
        // Not JSON, just remove surrounding quotes if present
        cleanedStripePriceId = cleanedStripePriceId.replace(/^["']|["']$/g, '');
      }
    }

    // Clean up stripeProductId if it's a JSON string
    let cleanedStripeProductId = stripeProductId;
    if (cleanedStripeProductId && typeof cleanedStripeProductId === 'string') {
      try {
        const parsed = JSON.parse(cleanedStripeProductId);
        if (typeof parsed === 'string') {
          cleanedStripeProductId = parsed;
        }
      } catch (e) {
        // Not JSON, just remove surrounding quotes if present
        cleanedStripeProductId = cleanedStripeProductId.replace(/^["']|["']$/g, '');
      }
    }

    // Create new plan (Firebase will auto-generate ID)
    const newPlan = {
      name: name.trim(),
      price: parseInt(price),
      ticketLimit: ticketLimit === 0 ? -1 : parseInt(ticketLimit),
      productionLimit: productionLimit === 0 ? -1 : parseInt(productionLimit),
      features: features.filter(f => f.trim() !== ''),
      isActive: Boolean(isActive),
      ...(cleanedStripeProductId && { stripeProductId: cleanedStripeProductId }),
      ...(cleanedStripePriceId && { stripePriceId: cleanedStripePriceId })
    };
    
    const createdPlan = await SubscriptionsController.createSubscriptionPlan(newPlan);
    
    res.status(201).json({ success: true, plan: createdPlan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update an existing subscription plan
router.put("/plans/:planId", async (req, res) => {
  try {
    
    const { planId } = req.params;
    const { name, price, ticketLimit, productionLimit, features, isActive, stripeProductId, stripePriceId } = req.body;
    
    // Check if plan exists
    const existingPlan = await SubscriptionsController.getSubscriptionPlanById(planId);
    if (!existingPlan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }
    
    // Validation
    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required" });
    }
    
    if (price < 0) {
      return res.status(400).json({ error: "Price must be positive" });
    }
    
    if (!Array.isArray(features)) {
      return res.status(400).json({ error: "Features must be an array" });
    }
    
    // Clean up stripePriceId if it's a JSON string
    let cleanedStripePriceId = stripePriceId;
    if (cleanedStripePriceId && typeof cleanedStripePriceId === 'string') {
      try {
        const parsed = JSON.parse(cleanedStripePriceId);
        if (typeof parsed === 'string') {
          cleanedStripePriceId = parsed;
        }
      } catch (e) {
        // Not JSON, just remove surrounding quotes if present
        cleanedStripePriceId = cleanedStripePriceId.replace(/^["']|["']$/g, '');
      }
    }

    // Clean up stripeProductId if it's a JSON string
    let cleanedStripeProductId = stripeProductId;
    if (cleanedStripeProductId && typeof cleanedStripeProductId === 'string') {
      try {
        const parsed = JSON.parse(cleanedStripeProductId);
        if (typeof parsed === 'string') {
          cleanedStripeProductId = parsed;
        }
      } catch (e) {
        // Not JSON, just remove surrounding quotes if present
        cleanedStripeProductId = cleanedStripeProductId.replace(/^["']|["']$/g, '');
      }
    }

    // Update plan
    const updatedPlan = {
      ...existingPlan,
      name: name.trim(),
      price: parseInt(price),
      ticketLimit: ticketLimit === 0 ? -1 : parseInt(ticketLimit),
      productionLimit: productionLimit === 0 ? -1 : parseInt(productionLimit),
      features: features.filter(f => f.trim() !== ''),
      isActive: Boolean(isActive),
      ...(cleanedStripeProductId && { stripeProductId: cleanedStripeProductId }),
      ...(cleanedStripePriceId && { stripePriceId: cleanedStripePriceId })
    };
    
    const result = await SubscriptionsController.upsertSubscriptionPlan(updatedPlan);
    
    res.json({ success: true, plan: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a subscription plan
router.delete("/plans/:planId", async (req, res) => {
  try {
    
    const { planId } = req.params;
    
    // Check if plan exists
    const existingPlan = await SubscriptionsController.getSubscriptionPlanById(planId);
    if (!existingPlan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }
    
    // TODO: Add check for existing subscriptions using this plan
    // const subscriptionsUsingPlan = await SubscriptionsController.getSubscriptionsByPlanId(planId);
    // if (subscriptionsUsingPlan.length > 0) {
    //   return res.status(400).json({ error: "Cannot delete plan that is currently in use" });
    // }
    
    await SubscriptionsController.deleteSubscriptionPlan(planId);
    
    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user's current subscription
router.get("/user/:userId", async (req, res) => {
  try {
    
    const { userId } = req.params;
    
    const subscription = await SubscriptionsController.getUserSubscriptionById(userId);
    
    if (!subscription) {
      return res.status(404).json({ error: "User subscription not found" });
    }
    
    res.json({ success: true, subscription });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create or update user subscription
router.post("/user/:userId", async (req, res) => {
  try {
    
    const { userId } = req.params;
    const { planId, status = 'active', currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd = false } = req.body;
    
    // Validation
    if (!planId) {
      return res.status(400).json({ error: "Plan ID is required" });
    }
    
    // Verify plan exists
    const plan = await SubscriptionsController.getSubscriptionPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }
    
    // Create subscription (Firebase will auto-generate ID)
    const subscription = {
      userId,
      planId,
      planName: plan.name,
      status,
      currentPeriodStart: currentPeriodStart || new Date().toISOString(),
      currentPeriodEnd: currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd)
    };
    
    const result = await SubscriptionsController.createUserSubscription(subscription);
    
    res.status(201).json({ success: true, subscription: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel user subscription
router.delete("/user/:userId", async (req, res) => {
  try {
    
    const { userId } = req.params;
    
    // Check if subscription exists
    const existingSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
    if (!existingSubscription) {
      return res.status(404).json({ error: "User subscription not found" });
    }
    
    await SubscriptionsController.deleteUserSubscription(userId);
    
    res.json({ success: true, message: "Subscription canceled successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
