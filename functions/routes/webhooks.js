const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { OrdersController, SubscriptionsController, TicketsController, UsersController } = require("../controllers");
const { sendReceiptEmail, sendTicketEmail, sendTicketsEmail } = require("../services/email");

// Initialize Stripe with proper error handling
let stripe;
try {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
} catch (error) {
  // Create a mock Stripe instance for development
  stripe = {
    webhooks: {
      constructEvent: () => Promise.reject(new Error("Stripe not configured")),
    }
  };
}

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

  // Helper to get Stripe API options with account context
  const getStripeOptions = () => stripeAccount ? { stripeAccount } : {};

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        let pi = event.data.object;
        
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
            const order = await OrdersController.getOrderById(orderId);
            if (!order) break;

            // Determine recipient email
            const buyerEmail = order.email || order.customerEmail || null;
            let toEmail = buyerEmail;
            if (!toEmail && order.userId) {
              try {
                const user = await UsersController.getUserById(order.userId);
                toEmail = user?.email || null;
              } catch {}
            }

            if (toEmail) {
              // Send receipt
              try {
                await sendReceiptEmail({ to: toEmail, order, subject: `Your receipt for order ${orderId}` });
              } catch (err) {
              }

              // Send a single consolidated tickets email
              try {
                const tickets = await TicketsController.getAllTickets(orderId);
                if (tickets?.length) {
                  const showName = order.performance?.productionName || order.performance?.title || order.productionName || 'your order';
                  await sendTicketsEmail({
                    to: toEmail,
                    subject: `Your tickets for ${showName}`,
                    order,
                    tickets,
                    performance: order.performance || null,
                    venue: order.venue || null,
                  });
                }
              } catch (err) {
              }
            } else {
            }
          } catch (error) {
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;

        // Update order payment status and lifecycle status
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

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
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
        } else {
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
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
        } else {
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
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
        } else {
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        // Handle subscription invoice payments
        if (invoice.subscription) {
          // Resolve userId directly from invoice.customer (don't rely on invoice metadata)
          const stripeCustomerId = typeof invoice.customer === 'string' 
            ? invoice.customer 
            : invoice.customer.id;
          
          let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
          
          // Fallback: if customer lookup fails, try subscription metadata
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
          } else {
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;

        // Handle subscription invoice payment failures
        if (invoice.subscription) {
          // Resolve userId directly from invoice.customer (don't rely on invoice metadata)
          const stripeCustomerId = typeof invoice.customer === 'string' 
            ? invoice.customer 
            : invoice.customer.id;
          
          let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
          
          // Fallback: if customer lookup fails, try subscription metadata
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
          } else {
          }
        }
        break;
      }
      default:
        break;
    }

  } catch (error) {
  }
}

// Use express.raw ONLY on this route
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {

      const sig = req.headers["stripe-signature"];
      let event;

      // Verify webhook signature
      try {
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
        });
      });

    } catch (handlerError) {
      // Catch any unhandled errors in the webhook handler
      
      // Always return 200 to Stripe so it doesn't retry
      // (Only if we haven't already sent a response)
      if (!res.headersSent) {
        res.sendStatus(200);
      }
    }
  }
);

module.exports = router;
