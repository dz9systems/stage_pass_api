const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { VenuesController } = require('../controllers');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// Get all connected accounts dashboard data
router.get('/accounts', async (req, res) => {
  try {
    // Get all theaters from local database
    const theaters = await VenuesController.getAllVenues();

    const dashboardData = {
      summary: {
        totalTheaters: theaters.length,
        expressAccounts: 0,
        standardAccounts: 0,
        activeAccounts: 0,
        pendingAccounts: 0,
        totalRevenue: 0,
        totalFees: 0
      },
      accounts: []
    };

    // Process each theater and get detailed Stripe account information
    for (const theater of theaters) {
      if (!theater.stripeAccountId) {
        // Theater without Stripe account
        dashboardData.accounts.push({
          theaterId: theater.id,
          theaterName: theater.name,
          accountType: null,
          status: 'not_connected',
          stripeAccountId: null,
          chargesEnabled: false,
          detailsSubmitted: false,
          payoutsEnabled: false,
          requirements: null,
          businessProfile: null,
          capabilities: null,
          balance: null,
          recentTransactions: [],
          error: null
        });
        continue;
      }

      try {
        // Get detailed account information from Stripe
        const account = await stripe.accounts.retrieve(theater.stripeAccountId);

        // Get account balance
        let balance = null;
        try {
          const balanceData = await stripe.balance.retrieve({
            stripeAccount: theater.stripeAccountId
          });
          balance = {
            available: balanceData.available[0]?.amount || 0,
            pending: balanceData.pending[0]?.amount || 0,
            currency: balanceData.available[0]?.currency || 'usd'
          };
        } catch (balanceError) {
          console.warn(`Could not retrieve balance for account ${theater.stripeAccountId}:`, balanceError.message);
        }

        // Get recent charges/transactions (last 10)
        let recentTransactions = [];
        try {
          const charges = await stripe.charges.list({
            limit: 10
          }, {
            stripeAccount: theater.stripeAccountId
          });
          recentTransactions = charges.data.map(charge => ({
            id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
            created: charge.created,
            description: charge.description,
            customer: charge.customer
          }));
        } catch (transactionError) {
          console.warn(`Could not retrieve transactions for account ${theater.stripeAccountId}:`, transactionError.message);
        }

        const accountData = {
          theaterId: theater.id,
          theaterName: theater.name,
          accountType: theater.accountType,
          status: account.charges_enabled && account.details_submitted ? 'active' : 'pending',
          stripeAccountId: theater.stripeAccountId,
          chargesEnabled: account.charges_enabled,
          detailsSubmitted: account.details_submitted,
          payoutsEnabled: account.payouts_enabled,
          requirements: account.requirements,
          businessProfile: account.business_profile,
          capabilities: account.capabilities,
          balance: balance,
          recentTransactions: recentTransactions,
          created: account.created,
          country: account.country,
          defaultCurrency: account.default_currency,
          error: null
        };

        dashboardData.accounts.push(accountData);

        // Update summary counts
        if (theater.accountType === 'express') {
          dashboardData.summary.expressAccounts++;
        } else if (theater.accountType === 'standard') {
          dashboardData.summary.standardAccounts++;
        }

        if (account.charges_enabled && account.details_submitted) {
          dashboardData.summary.activeAccounts++;
        } else {
          dashboardData.summary.pendingAccounts++;
        }

        // Add to total revenue (sum of recent transactions)
        if (balance) {
          dashboardData.summary.totalRevenue += balance.available + balance.pending;
        }

      } catch (accountError) {
        console.error(`Error retrieving account ${theater.stripeAccountId}:`, accountError.message);

        // Add account with error status
        dashboardData.accounts.push({
          theaterId: theater.id,
          theaterName: theater.name,
          accountType: theater.accountType,
          status: 'error',
          stripeAccountId: theater.stripeAccountId,
          chargesEnabled: false,
          detailsSubmitted: false,
          payoutsEnabled: false,
          requirements: null,
          businessProfile: null,
          capabilities: null,
          balance: null,
          recentTransactions: [],
          error: accountError.message
        });
      }
    }

    // Calculate total fees (this would need to be calculated from actual transaction data)
    // For now, we'll estimate based on Stripe's fee structure
    dashboardData.summary.totalFees = Math.round(dashboardData.summary.totalRevenue * 0.029 + 30); // 2.9% + 30¢ per transaction

    res.json(dashboardData);

  } catch (error) {
    console.error('Dashboard data retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      message: error.message
    });
  }
});

// Get specific account details
router.get('/accounts/:theaterId', async (req, res) => {
  try {
    const { theaterId } = req.params;

    // Get theater from local database
    const theaters = await VenuesController.getAllVenues();
    const theater = theaters.find(t => t.id === theaterId);

    if (!theater) {
      return res.status(404).json({ error: 'Theater not found' });
    }

    if (!theater.stripeAccountId) {
      return res.json({
        theaterId: theater.id,
        theaterName: theater.name,
        accountType: null,
        status: 'not_connected',
        stripeAccountId: null,
        chargesEnabled: false,
        detailsSubmitted: false,
        payoutsEnabled: false,
        requirements: null,
        businessProfile: null,
        capabilities: null,
        balance: null,
        recentTransactions: [],
        error: null
      });
    }

    // Get detailed account information from Stripe
    const account = await stripe.accounts.retrieve(theater.stripeAccountId);

    // Get account balance
    let balance = null;
    try {
      const balanceData = await stripe.balance.retrieve({
        stripeAccount: theater.stripeAccountId
      });
      balance = {
        available: balanceData.available[0]?.amount || 0,
        pending: balanceData.pending[0]?.amount || 0,
        currency: balanceData.available[0]?.currency || 'usd'
      };
    } catch (balanceError) {
      console.warn(`Could not retrieve balance for account ${theater.stripeAccountId}:`, balanceError.message);
    }

    // Get recent charges/transactions (last 20)
    let recentTransactions = [];
    try {
      const charges = await stripe.charges.list({
        limit: 20
      }, {
        stripeAccount: theater.stripeAccountId
      });
      recentTransactions = charges.data.map(charge => ({
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        created: charge.created,
        description: charge.description,
        customer: charge.customer,
        receipt_url: charge.receipt_url
      }));
    } catch (transactionError) {
      console.warn(`Could not retrieve transactions for account ${theater.stripeAccountId}:`, transactionError.message);
    }

    res.json({
      theaterId: theater.id,
      theaterName: theater.name,
      accountType: theater.accountType,
      status: account.charges_enabled && account.details_submitted ? 'active' : 'pending',
      stripeAccountId: theater.stripeAccountId,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements,
      businessProfile: account.business_profile,
      capabilities: account.capabilities,
      balance: balance,
      recentTransactions: recentTransactions,
      created: account.created,
      country: account.country,
      defaultCurrency: account.default_currency,
      error: null
    });

  } catch (error) {
    console.error('Account details retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve account details',
      message: error.message
    });
  }
});

// Get all products from Stripe
router.get('/products', async (req, res) => {
  try {
    const { limit = 100, active = true } = req.query;

    const products = await stripe.products.list({
      limit: parseInt(limit),
      active: active === 'true'
    });

    // Get pricing information for each product
    const productsWithPricing = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          limit: 10
        });

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active,
          created: product.created,
          updated: product.updated,
          metadata: product.metadata,
          images: product.images,
          type: product.type,
          unit_label: product.unit_label,
          url: product.url,
          prices: prices.data.map(price => ({
            id: price.id,
            active: price.active,
            currency: price.currency,
            unit_amount: price.unit_amount,
            recurring: price.recurring,
            type: price.type,
            created: price.created
          }))
        };
      })
    );

    res.json({
      summary: {
        totalProducts: products.data.length,
        activeProducts: products.data.filter(p => p.active).length,
        inactiveProducts: products.data.filter(p => !p.active).length
      },
      products: productsWithPricing
    });

  } catch (error) {
    console.error('Products retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve products',
      message: error.message
    });
  }
});

// Get all payments/charges from Stripe
router.get('/payments', async (req, res) => {
  try {
    const { limit = 100, created_after, created_before } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (created_after) params.created = { gte: parseInt(created_after) };
    if (created_before) params.created = { ...params.created, lte: parseInt(created_before) };

    const charges = await stripe.charges.list(params);

    if (!charges || !charges.data) {
      return res.json({
        summary: {
          totalPayments: 0,
          successfulPayments: 0,
          failedPayments: 0,
          totalAmount: 0,
          totalRefunded: 0,
          netAmount: 0
        },
        payments: []
      });
    }

    const paymentsData = charges.data.map(charge => ({
      id: charge.id,
      amount: charge.amount,
      amount_refunded: charge.amount_refunded,
      currency: charge.currency,
      status: charge.status,
      created: charge.created,
      description: charge.description,
      customer: charge.customer,
      payment_intent: charge.payment_intent,
      receipt_url: charge.receipt_url,
      refunded: charge.refunded,
      refunds: (charge.refunds?.data || []).map(refund => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        created: refund.created,
        reason: refund.reason
      })),
      source: {
        id: charge.source?.id,
        brand: charge.source?.brand,
        last4: charge.source?.last4,
        exp_month: charge.source?.exp_month,
        exp_year: charge.source?.exp_year
      },
      metadata: charge.metadata
    }));

    // Calculate summary statistics
    const totalAmount = charges.data.reduce((sum, charge) => sum + charge.amount, 0);
    const totalRefunded = charges.data.reduce((sum, charge) => sum + charge.amount_refunded, 0);
    const successfulPayments = charges.data.filter(charge => charge.status === 'succeeded').length;

    res.json({
      summary: {
        totalPayments: charges.data.length,
        successfulPayments,
        failedPayments: charges.data.filter(charge => charge.status === 'failed').length,
        totalAmount,
        totalRefunded,
        netAmount: totalAmount - totalRefunded
      },
      payments: paymentsData
    });

  } catch (error) {
    console.error('Payments retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payments',
      message: error.message
    });
  }
});

// Get all customers from Stripe
router.get('/customers', async (req, res) => {
  try {
    const { limit = 100, email } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (email) params.email = email;

    const customers = await stripe.customers.list(params);

    const customersData = (customers.data || []).map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      created: customer.created,
      updated: customer.updated,
      balance: customer.balance,
      currency: customer.currency,
      default_source: customer.default_source,
      delinquent: customer.delinquent,
      description: customer.description,
      metadata: customer.metadata,
      shipping: customer.shipping,
      tax_exempt: customer.tax_exempt
    }));

    const customersDataArray = customers.data || [];
    res.json({
      summary: {
        totalCustomers: customersDataArray.length,
        activeCustomers: customersDataArray.filter(c => !c.delinquent).length,
        delinquentCustomers: customersDataArray.filter(c => c.delinquent).length
      },
      customers: customersData
    });

  } catch (error) {
    console.error('Customers retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve customers',
      message: error.message
    });
  }
});

// Get all subscriptions from Stripe
router.get('/subscriptions', async (req, res) => {
  try {
    const { limit = 100, status, customer } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (status) params.status = status;
    if (customer) params.customer = customer;

    const subscriptions = await stripe.subscriptions.list(params);

    const subscriptionsData = (subscriptions.data || []).map(subscription => ({
      id: subscription.id,
      customer: subscription.customer,
      status: subscription.status,
      created: subscription.created,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at,
      ended_at: subscription.ended_at,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end,
      items: subscription.items.data.map(item => ({
        id: item.id,
        price: {
          id: item.price.id,
          unit_amount: item.price.unit_amount,
          currency: item.price.currency,
          recurring: item.price.recurring,
          product: item.price.product
        },
        quantity: item.quantity
      })),
      metadata: subscription.metadata
    }));

    // Calculate summary statistics
    const subscriptionsDataArray = subscriptions.data || [];
    const activeSubscriptions = subscriptionsDataArray.filter(sub => sub.status === 'active').length;
    const canceledSubscriptions = subscriptionsDataArray.filter(sub => sub.status === 'canceled').length;
    const totalRevenue = subscriptionsDataArray.reduce((sum, sub) => {
      return sum + sub.items.data.reduce((itemSum, item) => {
        return itemSum + (item.price.unit_amount * item.quantity);
      }, 0);
    }, 0);

    res.json({
      summary: {
        totalSubscriptions: subscriptionsDataArray.length,
        activeSubscriptions,
        canceledSubscriptions,
        trialingSubscriptions: subscriptionsDataArray.filter(sub => sub.status === 'trialing').length,
        totalRevenue
      },
      subscriptions: subscriptionsData
    });

  } catch (error) {
    console.error('Subscriptions retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve subscriptions',
      message: error.message
    });
  }
});

// Get comprehensive dashboard data including all Stripe data
router.get('/overview', async (req, res) => {
  try {
    // Get all data in parallel for better performance
    const [
      accountsData,
      productsData,
      paymentsData,
      customersData,
      subscriptionsData
    ] = await Promise.all([
      // Get accounts data (reuse existing logic)
      (async () => {
        const theaters = await VenuesController.getAllVenues();
        const accounts = [];

        for (const theater of theaters) {
          if (!theater.stripeAccountId) {
            accounts.push({
              theaterId: theater.id,
              theaterName: theater.name,
              accountType: null,
              status: 'not_connected',
              stripeAccountId: null
            });
            continue;
          }

          try {
            const account = await stripe.accounts.retrieve(theater.stripeAccountId);
            accounts.push({
              theaterId: theater.id,
              theaterName: theater.name,
              accountType: theater.accountType,
              status: account.charges_enabled && account.details_submitted ? 'active' : 'pending',
              stripeAccountId: theater.stripeAccountId,
              chargesEnabled: account.charges_enabled,
              detailsSubmitted: account.details_submitted
            });
          } catch (error) {
            accounts.push({
              theaterId: theater.id,
              theaterName: theater.name,
              accountType: theater.accountType,
              status: 'error',
              stripeAccountId: theater.stripeAccountId,
              error: error.message
            });
          }
        }

        return accounts;
      })(),

      // Get products
      stripe.products.list({ limit: 50, active: true }),

      // Get recent payments
      stripe.charges.list({ limit: 50 }),

      // Get customers
      stripe.customers.list({ limit: 50 }),

      // Get subscriptions
      stripe.subscriptions.list({ limit: 50 })
    ]);

    // Calculate comprehensive summary
    const summary = {
      accounts: {
        total: accountsData.length,
        active: accountsData.filter(a => a.status === 'active').length,
        pending: accountsData.filter(a => a.status === 'pending').length,
        notConnected: accountsData.filter(a => a.status === 'not_connected').length
      },
      products: {
        total: productsData.data.length,
        active: productsData.data.filter(p => p.active).length
      },
      payments: {
        total: paymentsData.data.length,
        successful: paymentsData.data.filter(p => p.status === 'succeeded').length,
        totalAmount: paymentsData.data.reduce((sum, p) => sum + p.amount, 0),
        totalRefunded: paymentsData.data.reduce((sum, p) => sum + p.amount_refunded, 0)
      },
      customers: {
        total: customersData.data.length,
        active: customersData.data.filter(c => !c.delinquent).length,
        delinquent: customersData.data.filter(c => c.delinquent).length
      },
      subscriptions: {
        total: subscriptionsData.data.length,
        active: subscriptionsData.data.filter(s => s.status === 'active').length,
        canceled: subscriptionsData.data.filter(s => s.status === 'canceled').length
      }
    };

    res.json({
      summary,
      accounts: accountsData,
      recentProducts: productsData.data.slice(0, 10),
      recentPayments: paymentsData.data.slice(0, 10),
      recentCustomers: customersData.data.slice(0, 10),
      recentSubscriptions: subscriptionsData.data.slice(0, 10)
    });

  } catch (error) {
    console.error('Overview data retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve overview data',
      message: error.message
    });
  }
});

// Get products from a specific connected account
router.get('/connected-accounts/:accountId/products', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 100, active = true } = req.query;

    const products = await stripe.products.list({
      limit: parseInt(limit),
      active: active === 'true'
    }, {
      stripeAccount: accountId
    });

    // Get pricing information for each product
    const productsWithPricing = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          limit: 10
        }, {
          stripeAccount: accountId
        });

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active,
          created: product.created,
          updated: product.updated,
          metadata: product.metadata,
          images: product.images,
          type: product.type,
          unit_label: product.unit_label,
          url: product.url,
          prices: prices.data.map(price => ({
            id: price.id,
            active: price.active,
            currency: price.currency,
            unit_amount: price.unit_amount,
            recurring: price.recurring,
            type: price.type,
            created: price.created
          }))
        };
      })
    );

    res.json({
      accountId,
      summary: {
        totalProducts: products.data.length,
        activeProducts: products.data.filter(p => p.active).length,
        inactiveProducts: products.data.filter(p => !p.active).length
      },
      products: productsWithPricing
    });

  } catch (error) {
    console.error('Connected account products retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve products for connected account',
      message: error.message
    });
  }
});

// Get payments from a specific connected account
router.get('/connected-accounts/:accountId/payments', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 100, created_after, created_before } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (created_after) params.created = { gte: parseInt(created_after) };
    if (created_before) params.created = { ...params.created, lte: parseInt(created_before) };

    const charges = await stripe.charges.list(params, {
      stripeAccount: accountId
    });

    if (!charges || !charges.data) {
      return res.json({
        accountId,
        summary: {
          totalPayments: 0,
          successfulPayments: 0,
          failedPayments: 0,
          totalAmount: 0,
          totalRefunded: 0,
          netAmount: 0
        },
        payments: []
      });
    }

    const paymentsData = charges.data.map(charge => ({
      id: charge.id,
      amount: charge.amount,
      amount_refunded: charge.amount_refunded,
      currency: charge.currency,
      status: charge.status,
      created: charge.created,
      description: charge.description,
      customer: charge.customer,
      payment_intent: charge.payment_intent,
      receipt_url: charge.receipt_url,
      refunded: charge.refunded,
      refunds: (charge.refunds?.data || []).map(refund => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        created: refund.created,
        reason: refund.reason
      })),
      source: {
        id: charge.source?.id,
        brand: charge.source?.brand,
        last4: charge.source?.last4,
        exp_month: charge.source?.exp_month,
        exp_year: charge.source?.exp_year
      },
      metadata: charge.metadata
    }));

    // Calculate summary statistics
    const totalAmount = charges.data.reduce((sum, charge) => sum + charge.amount, 0);
    const totalRefunded = charges.data.reduce((sum, charge) => sum + charge.amount_refunded, 0);
    const successfulPayments = charges.data.filter(charge => charge.status === 'succeeded').length;

    res.json({
      accountId,
      summary: {
        totalPayments: charges.data.length,
        successfulPayments,
        failedPayments: charges.data.filter(charge => charge.status === 'failed').length,
        totalAmount,
        totalRefunded,
        netAmount: totalAmount - totalRefunded
      },
      payments: paymentsData
    });

  } catch (error) {
    console.error('Connected account payments retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payments for connected account',
      message: error.message
    });
  }
});

// Get customers from a specific connected account
router.get('/connected-accounts/:accountId/customers', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 100, email } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (email) params.email = email;

    const customers = await stripe.customers.list(params, {
      stripeAccount: accountId
    });

    const customersData = (customers.data || []).map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      created: customer.created,
      updated: customer.updated,
      balance: customer.balance,
      currency: customer.currency,
      default_source: customer.default_source,
      delinquent: customer.delinquent,
      description: customer.description,
      metadata: customer.metadata,
      shipping: customer.shipping,
      tax_exempt: customer.tax_exempt
    }));

    const customersDataArray = customers.data || [];
    res.json({
      accountId,
      summary: {
        totalCustomers: customersDataArray.length,
        activeCustomers: customersDataArray.filter(c => !c.delinquent).length,
        delinquentCustomers: customersDataArray.filter(c => c.delinquent).length
      },
      customers: customersData
    });

  } catch (error) {
    console.error('Connected account customers retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve customers for connected account',
      message: error.message
    });
  }
});

// Get subscriptions from a specific connected account
router.get('/connected-accounts/:accountId/subscriptions', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 100, status, customer } = req.query;

    const params = {
      limit: parseInt(limit)
    };

    if (status) params.status = status;
    if (customer) params.customer = customer;

    const subscriptions = await stripe.subscriptions.list(params, {
      stripeAccount: accountId
    });

    const subscriptionsData = (subscriptions.data || []).map(subscription => ({
      id: subscription.id,
      customer: subscription.customer,
      status: subscription.status,
      created: subscription.created,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at,
      ended_at: subscription.ended_at,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end,
      items: subscription.items.data.map(item => ({
        id: item.id,
        price: {
          id: item.price.id,
          unit_amount: item.price.unit_amount,
          currency: item.price.currency,
          recurring: item.price.recurring,
          product: item.price.product
        },
        quantity: item.quantity
      })),
      metadata: subscription.metadata
    }));

    // Calculate summary statistics
    const subscriptionsDataArray = subscriptions.data || [];
    const activeSubscriptions = subscriptionsDataArray.filter(sub => sub.status === 'active').length;
    const canceledSubscriptions = subscriptionsDataArray.filter(sub => sub.status === 'canceled').length;
    const totalRevenue = subscriptionsDataArray.reduce((sum, sub) => {
      return sum + sub.items.data.reduce((itemSum, item) => {
        return itemSum + (item.price.unit_amount * item.quantity);
      }, 0);
    }, 0);

    res.json({
      accountId,
      summary: {
        totalSubscriptions: subscriptionsDataArray.length,
        activeSubscriptions,
        canceledSubscriptions,
        trialingSubscriptions: subscriptionsDataArray.filter(sub => sub.status === 'trialing').length,
        totalRevenue
      },
      subscriptions: subscriptionsData
    });

  } catch (error) {
    console.error('Connected account subscriptions retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve subscriptions for connected account',
      message: error.message
    });
  }
});

// Get comprehensive data from a specific connected account
router.get('/connected-accounts/:accountId/overview', async (req, res) => {
  try {
    const { accountId } = req.params;

    // Get all data in parallel for better performance
    const [
      accountData,
      productsData,
      paymentsData,
      customersData,
      subscriptionsData
    ] = await Promise.all([
      // Get account information
      stripe.accounts.retrieve(accountId),

      // Get products
      stripe.products.list({ limit: 50, active: true }, { stripeAccount: accountId }),

      // Get recent payments
      stripe.charges.list({ limit: 50 }, { stripeAccount: accountId }),

      // Get customers
      stripe.customers.list({ limit: 50 }, { stripeAccount: accountId }),

      // Get subscriptions
      stripe.subscriptions.list({ limit: 50 }, { stripeAccount: accountId })
    ]);

    // Calculate comprehensive summary
    const summary = {
      account: {
        id: accountData.id,
        type: accountData.type,
        country: accountData.country,
        chargesEnabled: accountData.charges_enabled,
        detailsSubmitted: accountData.details_submitted,
        payoutsEnabled: accountData.payouts_enabled,
        businessProfile: accountData.business_profile
      },
      products: {
        total: productsData.data.length,
        active: productsData.data.filter(p => p.active).length
      },
      payments: {
        total: paymentsData.data.length,
        successful: paymentsData.data.filter(p => p.status === 'succeeded').length,
        totalAmount: paymentsData.data.reduce((sum, p) => sum + p.amount, 0),
        totalRefunded: paymentsData.data.reduce((sum, p) => sum + p.amount_refunded, 0)
      },
      customers: {
        total: customersData.data.length,
        active: customersData.data.filter(c => !c.delinquent).length,
        delinquent: customersData.data.filter(c => c.delinquent).length
      },
      subscriptions: {
        total: subscriptionsData.data.length,
        active: subscriptionsData.data.filter(s => s.status === 'active').length,
        canceled: subscriptionsData.data.filter(s => s.status === 'canceled').length
      }
    };

    res.json({
      accountId,
      summary,
      recentProducts: productsData.data.slice(0, 10),
      recentPayments: paymentsData.data.slice(0, 10),
      recentCustomers: customersData.data.slice(0, 10),
      recentSubscriptions: subscriptionsData.data.slice(0, 10)
    });

  } catch (error) {
    console.error('Connected account overview retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve overview for connected account',
      message: error.message
    });
  }
});

// Create a new product in main Stripe account
router.post('/products', async (req, res) => {
  try {
    const {
      name,
      description,
      images,
      metadata,
      type,
      unit_label,
      url,
      default_price_data
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const productData = {
      name,
      description,
      images: images || [],
      metadata: metadata || {},
      url
    };

    // Add type only if no default_price_data is provided
    if (!default_price_data) {
      productData.type = type || 'good';

      // Only add unit_label for service type products
      if (type === 'service' && unit_label) {
        productData.unit_label = unit_label;
      }
    }

    // Add default price data if provided
    if (default_price_data) {
      productData.default_price_data = {
        currency: default_price_data.currency || 'usd',
        unit_amount: parseInt(default_price_data.unit_amount),
        tax_behavior: default_price_data.tax_behavior || 'unspecified',
        metadata: default_price_data.metadata || {},
        recurring: default_price_data.recurring,
        tiers: default_price_data.tiers,
        tiers_mode: default_price_data.tiers_mode,
        transform_quantity: default_price_data.transform_quantity,
        lookup_key: default_price_data.lookup_key
      };
    }

    const product = await stripe.products.create(productData);

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        created: product.created,
        updated: product.updated,
        metadata: product.metadata,
        images: product.images,
        type: product.type,
        unit_label: product.unit_label,
        url: product.url,
        default_price: product.default_price
      }
    });

  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

// Create a new product in a specific connected account
router.post('/connected-accounts/:accountId/products', async (req, res) => {
  try {
    const { accountId } = req.params;
    const {
      name,
      description,
      images,
      metadata,
      type,
      unit_label,
      url,
      default_price_data
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const productData = {
      name,
      description,
      images: images || [],
      metadata: metadata || {},
      url
    };

    // Add type only if no default_price_data is provided
    if (!default_price_data) {
      productData.type = type || 'good';

      // Only add unit_label for service type products
      if (type === 'service' && unit_label) {
        productData.unit_label = unit_label;
      }
    }

    // Add default price data if provided
    if (default_price_data) {
      productData.default_price_data = {
        currency: default_price_data.currency || 'usd',
        unit_amount: parseInt(default_price_data.unit_amount),
        tax_behavior: default_price_data.tax_behavior || 'unspecified',
        metadata: default_price_data.metadata || {},
        recurring: default_price_data.recurring,
        tiers: default_price_data.tiers,
        tiers_mode: default_price_data.tiers_mode,
        transform_quantity: default_price_data.transform_quantity,
        lookup_key: default_price_data.lookup_key
      };
    }

    const product = await stripe.products.create(productData, {
      stripeAccount: accountId
    });

    res.json({
      success: true,
      accountId,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        created: product.created,
        updated: product.updated,
        metadata: product.metadata,
        images: product.images,
        type: product.type,
        unit_label: product.unit_label,
        url: product.url,
        default_price: product.default_price
      }
    });

  } catch (error) {
    console.error('Connected account product creation error:', error);
    res.status(500).json({
      error: 'Failed to create product for connected account',
      message: error.message
    });
  }
});

// Create a price for a product in main Stripe account
router.post('/products/:productId/prices', async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      unit_amount,
      currency = 'usd',
      recurring,
      metadata,
      active = true,
      nickname,
      tax_behavior,
      tiers,
      tiers_mode,
      transform_quantity,
      lookup_key
    } = req.body;

    if (!unit_amount) {
      return res.status(400).json({ error: 'Unit amount is required' });
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: parseInt(unit_amount),
      currency,
      recurring,
      metadata: metadata || {},
      active,
      nickname,
      tax_behavior,
      tiers,
      tiers_mode,
      transform_quantity,
      lookup_key
    });

    res.json({
      success: true,
      price: {
        id: price.id,
        product: price.product,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring,
        type: price.type,
        created: price.created,
        metadata: price.metadata,
        nickname: price.nickname,
        tax_behavior: price.tax_behavior,
        tiers: price.tiers,
        tiers_mode: price.tiers_mode,
        transform_quantity: price.transform_quantity,
        lookup_key: price.lookup_key
      }
    });

  } catch (error) {
    console.error('Price creation error:', error);
    res.status(500).json({
      error: 'Failed to create price',
      message: error.message
    });
  }
});

// Create a price for a product in a specific connected account
router.post('/connected-accounts/:accountId/products/:productId/prices', async (req, res) => {
  try {
    const { accountId, productId } = req.params;
    const {
      unit_amount,
      currency = 'usd',
      recurring,
      metadata,
      active = true,
      nickname,
      tax_behavior,
      tiers,
      tiers_mode,
      transform_quantity,
      lookup_key
    } = req.body;

    if (!unit_amount) {
      return res.status(400).json({ error: 'Unit amount is required' });
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: parseInt(unit_amount),
      currency,
      recurring,
      metadata: metadata || {},
      active,
      nickname,
      tax_behavior,
      tiers,
      tiers_mode,
      transform_quantity,
      lookup_key
    }, {
      stripeAccount: accountId
    });

    res.json({
      success: true,
      accountId,
      price: {
        id: price.id,
        product: price.product,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring,
        type: price.type,
        created: price.created,
        metadata: price.metadata,
        nickname: price.nickname,
        tax_behavior: price.tax_behavior,
        tiers: price.tiers,
        tiers_mode: price.tiers_mode,
        transform_quantity: price.transform_quantity,
        lookup_key: price.lookup_key
      }
    });

  } catch (error) {
    console.error('Connected account price creation error:', error);
    res.status(500).json({
      error: 'Failed to create price for connected account',
      message: error.message
    });
  }
});

// Update a product in main Stripe account
router.put('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description, images, metadata, unit_label, url, active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (images !== undefined) updateData.images = images;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (unit_label !== undefined) updateData.unit_label = unit_label;
    if (url !== undefined) updateData.url = url;
    if (active !== undefined) updateData.active = active;

    const product = await stripe.products.update(productId, updateData);

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        created: product.created,
        updated: product.updated,
        metadata: product.metadata,
        images: product.images,
        type: product.type,
        unit_label: product.unit_label,
        url: product.url
      }
    });

  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

// Update a product in a specific connected account
router.put('/connected-accounts/:accountId/products/:productId', async (req, res) => {
  try {
    const { accountId, productId } = req.params;
    const { name, description, images, metadata, unit_label, url, active } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (images !== undefined) updateData.images = images;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (unit_label !== undefined) updateData.unit_label = unit_label;
    if (url !== undefined) updateData.url = url;
    if (active !== undefined) updateData.active = active;

    const product = await stripe.products.update(productId, updateData, {
      stripeAccount: accountId
    });

    res.json({
      success: true,
      accountId,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        created: product.created,
        updated: product.updated,
        metadata: product.metadata,
        images: product.images,
        type: product.type,
        unit_label: product.unit_label,
        url: product.url
      }
    });

  } catch (error) {
    console.error('Connected account product update error:', error);
    res.status(500).json({
      error: 'Failed to update product for connected account',
      message: error.message
    });
  }
});

// Delete a product in main Stripe account
router.delete('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await stripe.products.del(productId);

    res.json({
      success: true,
      deleted: product.deleted,
      id: product.id
    });

  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete product',
      message: error.message
    });
  }
});

// Delete a product in a specific connected account
router.delete('/connected-accounts/:accountId/products/:productId', async (req, res) => {
  try {
    const { accountId, productId } = req.params;

    const product = await stripe.products.del(productId, {
      stripeAccount: accountId
    });

    res.json({
      success: true,
      accountId,
      deleted: product.deleted,
      id: product.id
    });

  } catch (error) {
    console.error('Connected account product deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete product for connected account',
      message: error.message
    });
  }
});

module.exports = router;