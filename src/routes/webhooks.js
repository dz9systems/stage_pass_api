const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { OrdersController, SubscriptionsController, TicketsController, UsersController, PerformancesController, VenuesController } = require("../controllers");
const { sendReceiptEmail, sendTicketEmail, sendTicketsEmail } = require("../services/email");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/**
 * Helper function to resolve userId from stripeCustomerId
 * First checks customer metadata, then queries users collection
 */
async function resolveUserIdFromCustomer(stripeCustomerId, stripeAccount = null) {
  try {
    // First, try to get userId from customer metadata
    const customerOptions = stripeAccount ? { stripeAccount } : {};
    const customer = await stripe.customers.retrieve(stripeCustomerId, customerOptions);
    
    if (customer.metadata && customer.metadata.userId) {
      return customer.metadata.userId;
    }

    // Fallback: query users collection by stripeCustomerId
    // Note: This assumes users have a stripeCustomerId field
    const users = await UsersController.getAllUsers({ stripeCustomerId });
    if (users && users.length > 0) {
      return users[0].id;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Ensure the local user record stores the given stripeCustomerId
 */
async function backfillStripeCustomerId(userId, stripeCustomerId) {
  if (!userId || !stripeCustomerId) return;
  try {
    const user = await UsersController.getUserById(userId);
    if (user && user.stripeCustomerId !== stripeCustomerId) {
      await UsersController.updateUser(userId, { stripeCustomerId });
    }
  } catch (err) {
  }
}

/**
 * Generate secure view token for public order access
 */
function generateViewToken() {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Calculate token expiration (2 years from now)
 */
function calculateTokenExpiration() {
  const twoYearsFromNow = new Date();
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
  return twoYearsFromNow.toISOString();
}

/**
 * Create an order from PaymentIntent metadata when orderId is missing
 */
async function createOrderFromPaymentIntent(pi, getStripeOptions) {
  try {

    // Extract order data from PaymentIntent metadata
    const metadata = pi.metadata || {};
    
    // Required fields for order creation
    // Frontend sends sellerId (not theaterId or userId)
    const sellerId = metadata.sellerId;
    const productionId = metadata.productionId;
    const performanceId = metadata.performanceId;
    const totalAmount = pi.amount; // PaymentIntent amount is in cents
    
    // Validate required fields
    if (!sellerId || !productionId || !performanceId || !totalAmount) {
      const missingFields = [];
      if (!sellerId) missingFields.push('sellerId');
      if (!productionId) missingFields.push('productionId');
      if (!performanceId) missingFields.push('performanceId');
      if (!totalAmount) missingFields.push('amount');
      
      throw new Error(`Cannot create order: missing required fields in PaymentIntent metadata: ${missingFields.join(', ')}`);
    }

    // Generate order ID and view token
    const crypto = require("crypto");
    const orderId = crypto.randomBytes(16).toString('hex');
    const viewToken = generateViewToken();
    const viewTokenExpiresAt = calculateTokenExpiration();
    const baseUrl = metadata.baseUrl || process.env.APP_BASE_URL || 'https://www.stagepasspro.com';
    const now = new Date().toISOString();

    // Build venue address from separate fields if provided
    let venueAddress = metadata.venueAddress || null;
    if (!venueAddress && (metadata.venueCity || metadata.venueState || metadata.venueZipCode)) {
      const addressParts = [
        metadata.venueAddress,
        metadata.venueCity,
        metadata.venueState,
        metadata.venueZipCode
      ].filter(Boolean);
      if (addressParts.length > 0) {
        venueAddress = addressParts.join(', ');
      }
    }

    // Create order object
    const order = {
      id: orderId,
      userId: sellerId, // For backward compatibility
      sellerId,
      productionId,
      performanceId,
      totalAmount: parseInt(totalAmount),
      status: 'pending',
      paymentStatus: 'paid', // Payment already succeeded
      paymentMethod: pi.payment_method_types?.[0] || 'card',
      customerEmail: metadata.customerEmail || null,
      baseUrl,
      viewToken,
      viewTokenExpiresAt,
      // Store venue/location data from frontend (separate fields)
      venueName: metadata.venueName || null,
      venueAddress: venueAddress,
      venueCity: metadata.venueCity || null,
      venueState: metadata.venueState || null,
      venueZipCode: metadata.venueZipCode || null,
      // Store performance date/time from frontend
      performanceDate: metadata.performanceDate || null,
      performanceTime: metadata.performanceTime || null,
      // Add PaymentIntent ID for reference
      stripePaymentIntentId: pi.id,
      createdAt: now,
      updatedAt: now,
      tickets: [] // Tickets are created via order creation endpoint, not webhook
    };

    // Create the order
    const createdOrder = await OrdersController.upsertOrder(order);

    // Parse tickets from metadata if provided (tickets should be JSON string in metadata)
    let tickets = [];
    if (metadata.tickets) {
      try {
        // Try to parse as JSON string
        tickets = typeof metadata.tickets === 'string' 
          ? JSON.parse(metadata.tickets) 
          : metadata.tickets;
        
        if (!Array.isArray(tickets)) {
          tickets = [];
        }
      } catch (parseError) {
        tickets = [];
      }
    }

    // Create tickets subcollection if tickets data is provided
    if (tickets && tickets.length > 0) {
      
      const orderUrl = `${baseUrl}/orders/${orderId}?token=${encodeURIComponent(viewToken)}`;
      const ticketIds = [];
      
      for (const ticketData of tickets) {
        try {
          const ticketId = crypto.randomBytes(16).toString('hex');
          const ticket = {
            id: ticketId,
            seatId: ticketData.seatId || null,
            section: ticketData.section || null,
            row: ticketData.row || null,
            seatNumber: ticketData.seatNumber || null,
            price: parseInt(ticketData.price) || 0,
            status: 'valid',
            qrCode: orderUrl, // Use order URL with token for QR code
            createdAt: now
          };

          await TicketsController.upsertTicket(orderId, ticket);
          ticketIds.push(ticketId);
        } catch (ticketError) {
        }
      }

      // Update order with ticket IDs
      if (ticketIds.length > 0) {
        await OrdersController.updateOrder(orderId, { tickets: ticketIds });
      }
    } else {
    }

    // Update PaymentIntent metadata with the new orderId
    try {
      await stripe.paymentIntents.update(pi.id, {
        metadata: {
          ...metadata,
          orderId: orderId
        }
      }, getStripeOptions());
    } catch (updateError) {
      // Continue anyway - order is created
    }

    return createdOrder;
  } catch (error) {
    throw error;
  }
}

/**
 * Process webhook event asynchronously
 */
async function processWebhookEvent(event) {
  const connectedAccount = event.account || "platform";
  const stripeAccount = event.account || null;
  
  // Only log email-related events
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data?.object;

  }

  // Helper to get Stripe API options with account context
  const getStripeOptions = () => stripeAccount ? { stripeAccount } : {};

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        let pi = event.data.object;
        
        // If this is a connected account event, metadata might not be present
        // Fetch the PaymentIntent from the platform account (without account context) to get full metadata
        if (connectedAccount !== "platform" && (!pi.metadata || !pi.metadata.orderId)) {
          try {
            pi = await stripe.paymentIntents.retrieve(pi.id);
          } catch (err) {
          }
        }
        
        // Check if orderId is missing or empty (not just falsy)
        let orderId = pi.metadata?.orderId;
        if (!orderId || orderId.trim() === '') {

          try {
            // Create order from PaymentIntent metadata
            const createdOrder = await createOrderFromPaymentIntent(pi, getStripeOptions);
            orderId = createdOrder.id;
            
            // Re-fetch PaymentIntent to get updated metadata
            try {
              pi = await stripe.paymentIntents.retrieve(pi.id, getStripeOptions());
            } catch (err) {
            }
          } catch (createError) {

            break;
          }
        }

        // Update order payment status and lifecycle status
        if (orderId) {
          try {
            await OrdersController.updatePaymentStatus(orderId, 'paid');
            await OrdersController.updateOrderStatus(orderId, 'confirmed');

            // Fetch order, user, and tickets to send emails
            let order = await OrdersController.getOrderById(orderId);
            if (!order) {
              break;
            }
            
            // Ensure order has viewToken (for orders created before token system)
            if (!order.viewToken) {
              const crypto = require("crypto");
              const viewToken = crypto.randomBytes(32).toString('base64url');
              const twoYearsFromNow = new Date();
              twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
              const viewTokenExpiresAt = twoYearsFromNow.toISOString();
              
              await OrdersController.updateOrder(orderId, { viewToken, viewTokenExpiresAt });
              order = await OrdersController.getOrderById(orderId);
            }
            
            // Store baseUrl from payment intent metadata if provided (for QR code generation)
            const baseUrl = pi.metadata?.baseUrl;
            if (baseUrl && order.baseUrl !== baseUrl) {
              await OrdersController.updateOrder(orderId, { baseUrl });
              order.baseUrl = baseUrl;
            }

            // Determine recipient email - try multiple sources
            let toEmail = null;
            
            // Priority 1: PaymentIntent metadata.customerEmail (most reliable - set at payment time)
            if (pi.metadata?.customerEmail) {
              toEmail = pi.metadata.customerEmail;
            }
            // Priority 2: Order document email fields (customerEmail is the new field, email is legacy)
            else if (order.customerEmail || order.email) {
              toEmail = order.customerEmail || order.email;
            }
            // Priority 3: Look up user by userId (if userId is actually a user ID, not an email)
            else if (order.userId) {
              if (order.userId.includes('@')) {
                toEmail = order.userId;
              } else {
                try {
                  const user = await UsersController.getUserById(order.userId);
                  toEmail = user?.email || null;
                } catch (err) {
                }
              }
            }
            // Priority 4: Try to get email from Stripe customer if available
            if (!toEmail && pi.customer) {
              try {
                const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer.id;
                const customer = await stripe.customers.retrieve(customerId, getStripeOptions());
                if (customer.email) {
                  toEmail = customer.email;
                }
              } catch (err) {
              }
            }
            
            if (!toEmail) {

              break;
            }

            // Fetch seller info for email branding and reply-to
            let seller = null;
            if (order.sellerId) {
              try {
                seller = await UsersController.getUserById(order.sellerId);
              } catch (err) {
              }
            }

            // Send Order Summary email with tickets
            try {
              const tickets = await TicketsController.getAllTickets(orderId);
              
              // Debug: Log what's in the order object

              // Fetch performance and venue data if not already populated
              let performance = order.performance || null;
              let venue = order.venue || null;
              
              // If we have IDs but not full objects, fetch them
              if (!performance && order.performanceId) {
                // Validate performanceId is a valid string
                const performanceId = String(order.performanceId).trim();
                if (performanceId && performanceId.length > 0) {
                  try {
                    performance = await PerformancesController.getPerformanceById(performanceId);

                  } catch (err) {
                    // Create a minimal performance object from order data
                    // Combine date and time into proper ISO datetime string
                    let startTime = null;
                    if (order.performanceDate && order.performanceTime) {
                      startTime = `${order.performanceDate}T${order.performanceTime}:00`;
                    } else if (order.performanceDate) {
                      startTime = `${order.performanceDate}T00:00:00`;
                    }
                    
                    performance = {
                      id: order.performanceId,
                      productionName: null,
                      title: null,
                      date: order.performanceDate || null,
                      startTime: startTime
                    };
                  }
                } else {
                }
              } else if (!performance) {
                // Create a minimal performance object from order data if we have performanceId
                if (order.performanceId) {
                  // Combine date and time into proper ISO datetime string
                  let startTime = null;
                  if (order.performanceDate && order.performanceTime) {
                    startTime = `${order.performanceDate}T${order.performanceTime}:00`;
                  } else if (order.performanceDate) {
                    startTime = `${order.performanceDate}T00:00:00`;
                  }
                  
                  performance = {
                    id: order.performanceId,
                    productionName: null,
                    title: null,
                    date: order.performanceDate || null,
                    startTime: startTime
                  };
                } else {
                }
              }
              
              if (!venue && order.venueId) {
                // Validate venueId is a valid string
                const venueId = String(order.venueId).trim();
                if (venueId && venueId.length > 0) {
                  try {
                    venue = await VenuesController.getVenueById(venueId);

                  } catch (err) {
                  }
                } else {
                }
              } else if (!venue) {
              }
              
              // Also check if performance has venueId
              if (!venue && performance?.venueId) {
                const venueId = String(performance.venueId).trim();
                if (venueId && venueId.length > 0) {
                  try {
                    venue = await VenuesController.getVenueById(venueId);
                  } catch (err) {
                  }
                }
              }
              
              // Fallback: Use venue data from order if venue object not available
              if (!venue && (order.venueName || order.venueAddress || order.venueCity)) {
                venue = {
                  name: order.venueName || null,
                  address: order.venueAddress || null,
                  city: order.venueCity || null,
                  state: order.venueState || null,
                  zipCode: order.venueZipCode || null
                };
              }
              
              // Ensure performance has productionName - fetch if needed
              if (performance && !performance.productionName && !performance.title && order.productionId) {
                try {
                  const ProductionsController = require("../controllers").ProductionsController;
                  const production = await ProductionsController.getProductionById(order.productionId);
                  if (production) {
                    performance.productionName = production.name || production.title;
                  }
                } catch (err) {
                }
              }
              
              // Use performance date/time from order if performance object doesn't have it
              // Combine date and time into proper ISO datetime string
              if (performance && !performance.startTime && !performance.dateTime && !performance.date) {
                if (order.performanceDate && order.performanceTime) {
                  // Combine date (YYYY-MM-DD) and time (HH:mm) into ISO datetime
                  const combinedDateTime = `${order.performanceDate}T${order.performanceTime}:00`;
                  performance.startTime = combinedDateTime;
                  performance.date = order.performanceDate;
                } else if (order.performanceDate) {
                  performance.date = order.performanceDate;
                  // If only date, set time to start of day
                  performance.startTime = `${order.performanceDate}T00:00:00`;
                } else if (order.performanceTime) {
                  // If only time, use today's date
                  const today = new Date().toISOString().split('T')[0];
                  performance.startTime = `${today}T${order.performanceTime}:00`;
                }
              } else if (performance && order.performanceDate && order.performanceTime) {
                // If performance exists but doesn't have proper datetime, update it
                if (!performance.startTime || !performance.dateTime) {
                  const combinedDateTime = `${order.performanceDate}T${order.performanceTime}:00`;
                  performance.startTime = combinedDateTime;
                  performance.date = order.performanceDate;
                }
              }
              
              // Check SendGrid configuration before sending
              if (!process.env.SENDGRID_API_KEY) {
                throw new Error("SENDGRID_API_KEY is not set in environment variables");
              }
              if (!process.env.SENDGRID_FROM_EMAIL && !process.env.FROM_EMAIL) {
                throw new Error("SENDGRID_FROM_EMAIL or FROM_EMAIL is not set in environment variables");
              }
              
              await sendTicketsEmail({
                to: toEmail,
                subject: "Thank you for your order!",
                order,
                tickets: tickets || [],
                performance,
                venue,
                seller,
              });
            } catch (err) {
              if (err.response) {

              }
              if (err.stack) {
              }
            }
          } catch (error) {
            if (error.stack) {
            }
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        if (pi.metadata.orderId) {
          try {
            await OrdersController.updatePaymentStatus(pi.metadata.orderId, 'failed');
            await OrdersController.updateOrderStatus(pi.metadata.orderId, 'cancelled');
          } catch (error) {
          }
        }
        break;
      }
      case "charge.dispute.created": {
        // TODO: notify theater to upload evidence
        break;
      }
      case "account.updated": {
        break;
      }
      case "customer.subscription.created": {
        const subscription = event.data.object;
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
        }

        if (userId) {
          await backfillStripeCustomerId(userId, stripeCustomerId);
        }

        if (userId) {
          try {
            const localSubscription = {
              userId,
              planId: subscription.metadata?.planId || null,
              planName: subscription.metadata?.planName || null,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: typeof subscription.customer === 'string' 
                ? subscription.customer 
                : subscription.customer.id,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end
            };

            await SubscriptionsController.upsertUserSubscription(userId, localSubscription);
          } catch (error) {
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
        }

        if (userId) {
          await backfillStripeCustomerId(userId, stripeCustomerId);
        }

        if (userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(userId, {
                ...localSubscription,
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subscription.cancel_at_period_end
              });
            }
          } catch (error) {
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
        }

        if (userId) {
          await backfillStripeCustomerId(userId, stripeCustomerId);
        }

        if (userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(userId, {
                ...localSubscription,
                status: 'canceled',
                canceledAt: new Date().toISOString()
              });
            }
          } catch (error) {
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const stripeCustomerId = typeof invoice.customer === 'string' 
            ? invoice.customer 
            : invoice.customer.id;
          
          let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
          
          if (!userId) {
            try {
              const subscriptionOptions = getStripeOptions();
              const subscription = await stripe.subscriptions.retrieve(
                typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id,
                subscriptionOptions
              );
              
              if (subscription.metadata && subscription.metadata.userId) {
                userId = subscription.metadata.userId;
              }
            } catch (err) {
            }
          }

          if (userId) {
            await backfillStripeCustomerId(userId, stripeCustomerId);
          }

          if (userId) {
            try {
              const localSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
              if (localSubscription) {
                await SubscriptionsController.upsertUserSubscription(userId, {
                  ...localSubscription,
                  status: 'active',
                  lastPaymentDate: new Date().toISOString()
                });
              }
            } catch (error) {
            }
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const stripeCustomerId = typeof invoice.customer === 'string' 
            ? invoice.customer 
            : invoice.customer.id;
          
          let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
          
          if (!userId) {
            try {
              const subscriptionOptions = getStripeOptions();
              const subscription = await stripe.subscriptions.retrieve(
                typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id,
                subscriptionOptions
              );
              
              if (subscription.metadata && subscription.metadata.userId) {
                userId = subscription.metadata.userId;
              }
            } catch (err) {
            }
          }

          if (userId) {
            await backfillStripeCustomerId(userId, stripeCustomerId);
          }

          if (userId) {
            try {
              const localSubscription = await SubscriptionsController.getUserSubscriptionById(userId);
              if (localSubscription) {
                await SubscriptionsController.upsertUserSubscription(userId, {
                  ...localSubscription,
                  status: 'past_due',
                  lastPaymentFailedDate: new Date().toISOString()
                });
              }
            } catch (error) {
            }
          }
        }
        break;
      }
      default:
        break;
    }

  } catch (error) {
    if (error.stack) {
    }
  }
}

// Test endpoint to verify webhook route is accessible
router.get("/stripe/test", async (req, res) => {
  try {
    const acct = await stripe.accounts.retrieve();
    
    res.json({ 
      status: "ok", 
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString(),
      webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
      stripeAccount: {
        id: acct.id,
        livemode: acct.livemode
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Webhook endpoint is accessible but Stripe account retrieval failed",
      error: error.message,
      timestamp: new Date().toISOString(),
      webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET
    });
  }
});

// Webhook route - bodyParser.raw is already applied in index.js for /webhooks
router.post(
  "/stripe",
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];
      let event;

      // Verify webhook signature
      try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
          throw new Error("STRIPE_WEBHOOK_SECRET not set. When using 'stripe listen', copy the webhook signing secret (whsec_...) and set it as STRIPE_WEBHOOK_SECRET");
        }

        if (!sig) {
          throw new Error("No Stripe signature header present");
        }

        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {

        // Only allow unverified events in non-production environments
        if (process.env.NODE_ENV === 'production') {
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Fallback for testing/development only
        try {
          event = JSON.parse(req.body.toString());
        } catch (parseErr) {
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }
      }

      // CRITICAL: Send 200 response IMMEDIATELY after signature verification
      // This prevents Stripe from retrying if processing takes too long
      res.sendStatus(200);

      // Process the event asynchronously (after response is sent)
      // Use setImmediate to ensure response is fully sent before processing
      setImmediate(() => {
        processWebhookEvent(event).catch(error => {
          if (error.stack) {
          }
        });
      });

    } catch (handlerError) {
      // Catch any unhandled errors in the webhook handler
      if (handlerError.stack) {
      }
      
      // Always return 200 to Stripe so it doesn't retry
      // (Only if we haven't already sent a response)
      if (!res.headersSent) {
        res.sendStatus(200);
      }
    }
  }
);

module.exports = router;
