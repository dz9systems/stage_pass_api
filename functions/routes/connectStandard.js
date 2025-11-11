const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const crypto = require('crypto');
const { UsersController } = require('../controllers');

// Initialize Stripe with proper error handling
let stripe;
try {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
  });
} catch (error) {
  // Create a mock Stripe instance for development
  stripe = {
    oauth: {
      token: () => Promise.reject(new Error('Stripe not configured')),
    },
    accounts: {
      retrieve: () => Promise.reject(new Error('Stripe not configured')),
    }
  };
}

// Start OAuth (redirect to Stripe). Include theaterId in state.
router.get('/oauth/start', (req, res) => {
  const { theaterId } = req.query;
  if (!theaterId) return res.status(400).send('Missing theaterId');

  const state = JSON.stringify({ theaterId, nonce: crypto.randomUUID() });
  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, '') || '';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: `${baseUrl}/connect/standard/oauth/callback`,
    state
  });

  res.redirect(`https://connect.stripe.com/oauth/authorize?${params.toString()}`);
});

// OAuth callback: exchange code for account id
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const parsed = JSON.parse(state || '{}');
    const theaterId = parsed.theaterId;
    if (!theaterId) return res.status(400).send('Missing theaterId in state');

    const token = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    await UsersController.upsertUser({
      id: theaterId,
      stripeAccountId: token.stripe_user_id, // acct_...
      accountType: 'standard'
    });

    res.send('Connected! You can close this tab.');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

module.exports = router;
