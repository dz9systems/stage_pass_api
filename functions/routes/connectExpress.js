const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { VenuesController, UsersController } = require("../controllers");

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
    accounts: {
      create: () => Promise.reject(new Error("Stripe not configured")),
      retrieve: () => Promise.reject(new Error("Stripe not configured")),
      del: () => Promise.reject(new Error("Stripe not configured")),
      list: () => Promise.reject(new Error("Stripe not configured")),
      createLoginLink: () => Promise.reject(new Error("Stripe not configured")),
    },
    accountLinks: {
      create: () => Promise.reject(new Error("Stripe not configured")),
    }
  };
}

// Delete a connected account (accepts accountId or theaterId)
router.delete("/account", async (req, res) => {
  try {
    const { accountId } = req.body || {};
    const theaterId = req.body?.theaterId || req.query?.theaterId;

    let targetAccountId = accountId;
    if (!targetAccountId) {
      if (!theaterId) return res.status(400).json({ error: "Provide accountId or theaterId" });

      const seller = await UsersController.getUserById(theaterId);
      if (!seller?.stripeAccountId)
        return res.status(404).json({ error: "Seller not connected to Stripe" });
      targetAccountId = seller.stripeAccountId;
    }

    const deleted = await stripe.accounts.del(targetAccountId);

    // Best effort: clear local mapping when theaterId provided
    if (theaterId) {
      await UsersController.upsertUser({
        id: theaterId,
        stripeAccountId: null,
        accountType: null,
      });
    }
    console.log('deleted::', deleted);
    res.json(deleted);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Create Express connected account
router.post("/create-account", async (req, res) => {
  try {
    const { theaterId, name } = req.body;
    if (!theaterId) return res.status(400).json({ error: "Missing theaterId" });

    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: name ? { name } : undefined,
    });

    // Update the user (theaterId = sellerId = userId) with Stripe account info
    await UsersController.upsertUser({
      id: theaterId,
      stripeAccountId: account.id,
      accountType: "express",
    });

    res.json({ accountId: account.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get single-use onboarding link
router.post("/onboard-link", async (req, res) => {
  try {
    const { accountId } = req.body;
    console.log('accountId::', accountId);
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${process.env.APP_BASE_URL}/admin`,
      return_url: `${process.env.APP_BASE_URL}/admin`,
    });

    res.json({ url: link.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Check onboarding status
router.get("/status", async (req, res) => {
  try {
    const { theaterId } = req.query;
    if (!theaterId) return res.status(400).json({ error: "Missing theaterId" });

    const seller = await UsersController.getUserById(theaterId);
    if (!seller?.stripeAccountId)
      return res.status(404).json({ error: "Seller not connected to Stripe" });

    const acct = await stripe.accounts.retrieve(seller.stripeAccountId);
    res.json({
      ready: acct.charges_enabled && acct.details_submitted,
      charges_enabled: acct.charges_enabled,
      details_submitted: acct.details_submitted,
      requirements: acct.requirements,
      payouts_enabled: acct.payouts_enabled,
      currently_due: acct.requirements?.currently_due || [],
      eventually_due: acct.requirements?.eventually_due || [],
      past_due: acct.requirements?.past_due || [],
      disabled_reason: acct.requirements?.disabled_reason,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Express Dashboard login link
router.post("/login-link", async (req, res) => {
  try {
    const { theaterId } = req.body;
    if (!theaterId) return res.status(400).json({ error: "Missing theaterId" });

    const seller = await UsersController.getUserById(theaterId);
    if (!seller?.stripeAccountId)
      return res.status(404).json({ error: "Seller not connected to Stripe" });

    const login = await stripe.accounts.createLoginLink(seller.stripeAccountId);
    res.json({ url: login.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Delete ALL Express accounts
router.delete("/accounts/all", async (req, res) => {
  try {
    // Get all connected accounts from Stripe
    const accounts = await stripe.accounts.list({
      limit: 100 // Stripe's max limit
    });


    // Filter for Express accounts only
    const expressAccounts = accounts.data.filter(account => account.type === 'express');

    if (expressAccounts.length === 0) {
      return res.json({
        message: "No Express accounts found to delete",
        deletedCount: 0,
        errors: []
      });
    }

    const results = {
      deletedCount: 0,
      errors: [],
      deletedAccounts: []
    };

    // Delete each Express account
    for (const account of expressAccounts) {
      try {
        await stripe.accounts.del(account.id);

        // Clear local user records for this account
        const users = await UsersController.getAllUsers();
        const userWithAccount = users.find(user => user.stripeAccountId === account.id);
        if (userWithAccount) {
          await UsersController.upsertUser({
            id: userWithAccount.id,
            stripeAccountId: null,
            accountType: null,
          });
        }

        results.deletedCount++;
        results.deletedAccounts.push({
          accountId: account.id,
        });
      } catch (error) {
        console.error(`Failed to delete account ${account.id}:`, error);
        results.errors.push({
          accountId: account.id,
          error: error.message
        });
      }
    }

    res.json({
      message: `Successfully deleted ${results.deletedCount} Express accounts`,
      ...results
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
