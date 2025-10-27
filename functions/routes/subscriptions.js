const express = require("express");
const router = express.Router();
const { SubscriptionsController } = require("../controllers");

// Get all subscription plans
router.get("/plans", async (req, res) => {
  try {
    console.log("🔍 Fetching subscription plans");
    
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
    console.error("❌ Failed to fetch subscription plans:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get subscription plan by ID
router.get("/plans/:planId", async (req, res) => {
  try {
    console.log("🔍 Fetching subscription plan:", req.params.planId);
    
    const { planId } = req.params;
    const plan = await SubscriptionsController.getSubscriptionPlanById(planId);
    
    if (!plan) {
      return res.status(404).json({ error: "Subscription plan not found" });
    }
    
    res.json({ success: true, plan });
  } catch (e) {
    console.error("❌ Failed to fetch subscription plan:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create a new subscription plan
router.post("/plans", async (req, res) => {
  try {
    console.log("🔍 Creating subscription plan:", req.body);
    
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
    
    // Create new plan (Firebase will auto-generate ID)
    const newPlan = {
      name: name.trim(),
      price: parseInt(price),
      ticketLimit: ticketLimit === 0 ? -1 : parseInt(ticketLimit),
      productionLimit: productionLimit === 0 ? -1 : parseInt(productionLimit),
      features: features.filter(f => f.trim() !== ''),
      isActive: Boolean(isActive),
      ...(stripeProductId && { stripeProductId }),
      ...(stripePriceId && { stripePriceId })
    };
    
    const createdPlan = await SubscriptionsController.createSubscriptionPlan(newPlan);
    
    console.log("✅ Subscription plan created:", createdPlan);
    res.status(201).json({ success: true, plan: createdPlan });
  } catch (e) {
    console.error("❌ Failed to create subscription plan:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update an existing subscription plan
router.put("/plans/:planId", async (req, res) => {
  try {
    console.log("🔍 Updating subscription plan:", req.params.planId, req.body);
    
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
    
    // Update plan
    const updatedPlan = {
      ...existingPlan,
      name: name.trim(),
      price: parseInt(price),
      ticketLimit: ticketLimit === 0 ? -1 : parseInt(ticketLimit),
      productionLimit: productionLimit === 0 ? -1 : parseInt(productionLimit),
      features: features.filter(f => f.trim() !== ''),
      isActive: Boolean(isActive),
      ...(stripeProductId && { stripeProductId }),
      ...(stripePriceId && { stripePriceId })
    };
    
    const result = await SubscriptionsController.upsertSubscriptionPlan(updatedPlan);
    
    console.log("✅ Subscription plan updated:", result);
    res.json({ success: true, plan: result });
  } catch (e) {
    console.error("❌ Failed to update subscription plan:", e);
    res.status(500).json({ error: e.message });
  }
});

// Delete a subscription plan
router.delete("/plans/:planId", async (req, res) => {
  try {
    console.log("🔍 Deleting subscription plan:", req.params.planId);
    
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
    
    console.log("✅ Subscription plan deleted:", planId);
    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (e) {
    console.error("❌ Failed to delete subscription plan:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get user's current subscription
router.get("/user/:userId", async (req, res) => {
  try {
    console.log("🔍 Fetching user subscription:", req.params.userId);
    
    const { userId } = req.params;
    
    const subscription = await SubscriptionsController.getUserSubscriptionById(userId);
    
    if (!subscription) {
      return res.status(404).json({ error: "User subscription not found" });
    }
    
    res.json({ success: true, subscription });
  } catch (e) {
    console.error("❌ Failed to fetch user subscription:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create or update user subscription
router.post("/user/:userId", async (req, res) => {
  try {
    console.log("🔍 Creating/updating user subscription:", req.params.userId, req.body);
    
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
    
    console.log("✅ User subscription created/updated:", result);
    res.status(201).json({ success: true, subscription: result });
  } catch (e) {
    console.error("❌ Failed to create/update user subscription:", e);
    res.status(500).json({ error: e.message });
  }
});

// Cancel user subscription
router.delete("/user/:userId", async (req, res) => {
  try {
    console.log("🔍 Canceling user subscription:", req.params.userId);
    
    const { userId } = req.params;
    
    // Check if subscription exists
    const existingSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
    if (!existingSubscription) {
      return res.status(404).json({ error: "User subscription not found" });
    }
    
    await SubscriptionsController.deleteUserSubscription(userId);
    
    console.log("✅ User subscription canceled:", userId);
    res.json({ success: true, message: "Subscription canceled successfully" });
  } catch (e) {
    console.error("❌ Failed to cancel user subscription:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
