const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { OrdersController, SubscriptionsController } = require("../controllers");

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

// Use express.raw ONLY on this route
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const connectedAccount = event.account || "platform";

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log("✅ Payment succeeded", connectedAccount, pi.id, pi.metadata);
        
        // Update order payment status
        if (pi.metadata.orderId) {
          try {
            await OrdersController.updatePaymentStatus(pi.metadata.orderId, 'paid');
            console.log(`✅ Order ${pi.metadata.orderId} marked as paid`);
          } catch (error) {
            console.error(`❌ Failed to update order ${pi.metadata.orderId}:`, error.message);
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log("❌ Payment failed", connectedAccount, pi.id, pi.metadata);
        
        // Update order payment status
        if (pi.metadata.orderId) {
          try {
            await OrdersController.updatePaymentStatus(pi.metadata.orderId, 'failed');
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
        
        // Update local subscription record
        if (subscription.metadata.userId) {
          try {
            const localSubscription = {
              userId: subscription.metadata.userId,
              planId: subscription.metadata.planId,
              planName: subscription.metadata.planName,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: subscription.customer,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end
            };
            
            await SubscriptionsController.upsertUserSubscription(subscription.metadata.userId, localSubscription);
            console.log(`✅ Local subscription updated for user ${subscription.metadata.userId}`);
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${subscription.metadata.userId}:`, error.message);
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("🔄 Subscription updated", connectedAccount, subscription.id);
        
        // Update local subscription record
        if (subscription.metadata.userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(subscription.metadata.userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(subscription.metadata.userId, {
                ...localSubscription,
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subscription.cancel_at_period_end
              });
              console.log(`✅ Local subscription updated for user ${subscription.metadata.userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${subscription.metadata.userId}:`, error.message);
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("❌ Subscription deleted", connectedAccount, subscription.id);
        
        // Update local subscription record
        if (subscription.metadata.userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(subscription.metadata.userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(subscription.metadata.userId, {
                ...localSubscription,
                status: 'canceled',
                canceledAt: new Date().toISOString()
              });
              console.log(`✅ Local subscription canceled for user ${subscription.metadata.userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update local subscription for user ${subscription.metadata.userId}:`, error.message);
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        console.log("✅ Invoice payment succeeded", connectedAccount, invoice.id);
        
        // Handle subscription invoice payments
        if (invoice.subscription && invoice.metadata.userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(invoice.metadata.userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(invoice.metadata.userId, {
                ...localSubscription,
                status: 'active',
                lastPaymentDate: new Date().toISOString()
              });
              console.log(`✅ Subscription payment processed for user ${invoice.metadata.userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update subscription payment for user ${invoice.metadata.userId}:`, error.message);
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("❌ Invoice payment failed", connectedAccount, invoice.id);
        
        // Handle subscription invoice payment failures
        if (invoice.subscription && invoice.metadata.userId) {
          try {
            const localSubscription = await SubscriptionsController.getUserSubscriptionById(invoice.metadata.userId);
            if (localSubscription) {
              await SubscriptionsController.upsertUserSubscription(invoice.metadata.userId, {
                ...localSubscription,
                status: 'past_due',
                lastPaymentFailedDate: new Date().toISOString()
              });
              console.log(`❌ Subscription payment failed for user ${invoice.metadata.userId}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update subscription payment failure for user ${invoice.metadata.userId}:`, error.message);
          }
        }
        break;
      }
      default:
        // console.log("Unhandled:", event.type);
        break;
    }

    res.sendStatus(200);
  }
);

module.exports = router;