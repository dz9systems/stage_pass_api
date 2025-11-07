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
  console.error("Failed to initialize Stripe:", error.message);
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
    console.error(`❌ Failed to resolve userId from customer ${stripeCustomerId}:`, error.message);
    return null;
  }
}

/**
 * Process webhook event asynchronously
 */
async function processWebhookEvent(event) {
  const connectedAccount = event.account || "platform";
  const stripeAccount = event.account || null;
  
  console.log("\n" + "=".repeat(80));
  console.log("📨 PROCESSING STRIPE EVENT:", {
    type: event.type,
    connectedAccount,
    eventId: event.id,
    objectId: event.data?.object?.id || 'N/A',
    timestamp: new Date().toISOString()
  });
  console.log("=".repeat(80) + "\n");

  // Helper to get Stripe API options with account context
  const getStripeOptions = () => stripeAccount ? { stripeAccount } : {};

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log("✅ Payment succeeded", connectedAccount, pi.id, pi.metadata);
        if (!pi.metadata || !pi.metadata.orderId) {
          console.warn(
            "⚠️ PaymentIntent has no metadata.orderId — cannot update order or send emails.",
            { paymentIntentId: pi.id }
          );
          break;
        }

        // Update order payment status and lifecycle status
        if (pi.metadata && pi.metadata.orderId) {
          try {
            console.log("🧾 Updating order statuses to paid/confirmed", pi.metadata.orderId);
            await OrdersController.updatePaymentStatus(pi.metadata.orderId, 'paid');
            await OrdersController.updateOrderStatus(pi.metadata.orderId, 'confirmed');
            console.log(`✅ Order ${pi.metadata.orderId} marked as paid`);

            // Fetch order, user, and tickets to send emails
            const orderId = pi.metadata.orderId;
            console.log("🔎 Fetching order to prepare emails:", orderId);
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
                console.log("📧 Sending receipt email to:", toEmail);
                await sendReceiptEmail({ to: toEmail, order, subject: `Your receipt for order ${orderId}` });
                console.log(`📧 Receipt email sent to ${toEmail} for ${orderId}`);
              } catch (err) {
                console.error(`❌ Failed to send receipt for ${orderId}:`, err.message);
              }

              // Send a single consolidated tickets email
              try {
                console.log("🎟️ Fetching tickets for email:", orderId);
                const tickets = await TicketsController.getAllTickets(orderId);
                if (tickets?.length) {
                  const showName = order.performance?.productionName || order.performance?.title || order.productionName || 'your order';
                  console.log(`🎟️ Sending consolidated tickets email with ${tickets.length} tickets to:`, toEmail);
                  await sendTicketsEmail({
                    to: toEmail,
                    subject: `Your tickets for ${showName}`,
                    order,
                    tickets,
                    performance: order.performance || null,
                    venue: order.venue || null,
                  });
                  console.log(`🎟️ Sent consolidated tickets email (${tickets.length} tickets) to ${toEmail} for ${orderId}`);
                }
              } catch (err) {
                console.error(`❌ Failed to send consolidated tickets email for ${orderId}:`, err.message);
              }
            } else {
              console.warn(`⚠️ No recipient email found for order ${orderId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update order ${pi.metadata.orderId}:`, error.message);
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log("❌ Payment failed", connectedAccount, pi.id, pi.metadata);

        // Update order payment status and lifecycle status
        if (pi.metadata.orderId) {
          try {
            await OrdersController.updatePaymentStatus(pi.metadata.orderId, 'failed');
            await OrdersController.updateOrderStatus(pi.metadata.orderId, 'cancelled');
            console.log(`❌ Order ${pi.metadata.orderId} marked as failed`);
          } catch (error) {
            console.error(`❌ Failed to update order ${pi.metadata.orderId}:`, error.message);
          }
        }
        break;
      }
      case "charge.dispute.created": {
        console.log("⚠️ Dispute created", connectedAccount);
        // TODO: notify theater to upload evidence
        break;
      }
      case "account.updated": {
        console.log("ℹ️ Account updated", connectedAccount);
        break;
      }
      case "customer.subscription.created": {
        const subscription = event.data.object;
        console.log("✅ Subscription created", connectedAccount, subscription.id);

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
          console.log(`⚠️ Resolved userId from subscription metadata (customer lookup failed for ${stripeCustomerId})`);
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
            console.log(`✅ Local subscription updated for user ${userId}`);
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${userId}:`, error.message);
          }
        } else {
          console.warn(`⚠️ Could not resolve userId for subscription ${subscription.id}`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("🔄 Subscription updated", connectedAccount, subscription.id);

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
          console.log(`⚠️ Resolved userId from subscription metadata (customer lookup failed for ${stripeCustomerId})`);
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
              console.log(`✅ Local subscription updated for user ${userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${userId}:`, error.message);
          }
        } else {
          console.warn(`⚠️ Could not resolve userId for subscription ${subscription.id}`);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("❌ Subscription deleted", connectedAccount, subscription.id);

        // Resolve userId - prefer customer lookup (metadata is set at creation but customer is more reliable)
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        let userId = await resolveUserIdFromCustomer(stripeCustomerId, stripeAccount);
        
        // Fallback: if customer lookup fails, try subscription metadata
        if (!userId && subscription.metadata && subscription.metadata.userId) {
          userId = subscription.metadata.userId;
          console.log(`⚠️ Resolved userId from subscription metadata (customer lookup failed for ${stripeCustomerId})`);
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
              console.log(`✅ Local subscription canceled for user ${userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${userId}:`, error.message);
          }
        } else {
          console.warn(`⚠️ Could not resolve userId for subscription ${subscription.id}`);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        console.log("✅ Invoice payment succeeded", connectedAccount, invoice.id);

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
                console.log(`⚠️ Resolved userId from subscription metadata (customer lookup failed for ${stripeCustomerId})`);
              }
            } catch (err) {
              console.error(`❌ Failed to retrieve subscription for invoice ${invoice.id}:`, err.message);
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
                console.log(`✅ Subscription payment processed for user ${userId}`);
              }
            } catch (error) {
              console.error(`❌ Failed to update subscription payment for user ${userId}:`, error.message);
            }
          } else {
            console.warn(`⚠️ Could not resolve userId for invoice ${invoice.id} (customer: ${stripeCustomerId})`);
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("❌ Invoice payment failed", connectedAccount, invoice.id);

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
                console.log(`⚠️ Resolved userId from subscription metadata (customer lookup failed for ${stripeCustomerId})`);
              }
            } catch (err) {
              console.error(`❌ Failed to retrieve subscription for invoice ${invoice.id}:`, err.message);
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
                console.log(`❌ Subscription payment failed for user ${userId}`);
              }
            } catch (error) {
              console.error(`❌ Failed to update subscription payment failure for user ${userId}:`, error.message);
            }
          } else {
            console.warn(`⚠️ Could not resolve userId for invoice ${invoice.id} (customer: ${stripeCustomerId})`);
          }
        }
        break;
      }
      default:
        console.log(`ℹ️  Unhandled webhook event type: ${event.type}`, { eventId: event.id, connectedAccount });
        break;
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ WEBHOOK EVENT PROCESSING COMPLETE");
    console.log("=".repeat(80) + "\n");
  } catch (error) {
    console.error("\n" + "❌".repeat(40));
    console.error("❌❌❌ ERROR PROCESSING WEBHOOK EVENT ❌❌❌");
    console.error("Event type:", event.type);
    console.error("Event ID:", event.id);
    console.error("Error:", error);
    console.error("Stack:", error.stack);
    console.error("❌".repeat(40) + "\n");
  }
}

// Use express.raw ONLY on this route
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      console.log("➡️  Incoming Stripe webhook:", {
        path: req.originalUrl,
        method: req.method,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        stripeSignaturePresent: !!req.headers["stripe-signature"],
      });
      
      const sig = req.headers["stripe-signature"];
      let event;

      // Verify webhook signature
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
        console.log("✅ Webhook signature verified successfully");
      } catch (err) {
        console.error("❌ Webhook signature verification failed:", err.message);
        
        // Only allow unverified events in non-production environments
        if (process.env.NODE_ENV === 'production') {
          console.error("🚫 Rejecting unverified webhook in production");
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Fallback for testing/development only
        console.warn("⚠️  WARNING: Processing webhook WITHOUT signature verification (NODE_ENV !== 'production')");
        try {
          event = JSON.parse(req.body.toString());
        } catch (parseErr) {
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }
      }

      // CRITICAL: Send 200 response IMMEDIATELY after signature verification
      // This prevents Stripe from retrying if processing takes too long
      res.sendStatus(200);
      console.log("✅ ACK (200) sent to Stripe - processing event asynchronously");

      // Process the event asynchronously (after response is sent)
      // Use setImmediate to ensure response is fully sent before processing
      setImmediate(() => {
        processWebhookEvent(event).catch(error => {
          console.error("❌ Unhandled error in async webhook processing:", error);
        });
      });

    } catch (handlerError) {
      // Catch any unhandled errors in the webhook handler
      console.error("❌❌❌ UNHANDLED WEBHOOK ERROR ❌❌❌");
      console.error("Error:", handlerError);
      console.error("Stack:", handlerError.stack);
      
      // Always return 200 to Stripe so it doesn't retry
      // (Only if we haven't already sent a response)
      if (!res.headersSent) {
        res.sendStatus(200);
      }
    }
  }
);

module.exports = router;
