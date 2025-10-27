const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class SubscriptionsController {
  constructor() {
    this.collection = 'subscriptions';
    this.plansCollection = 'subscription_plans';
  }

  // Create a new subscription plan (Firebase auto-generates ID)
  async createSubscriptionPlan(plan) {
    try {
      const planWithTimestamps = addTimestamps(plan);
      const planRef = db.collection(this.plansCollection).doc();
      await planRef.set(planWithTimestamps);
      
      const createdPlan = await planRef.get();
      return docToObject(createdPlan);
    } catch (error) {
      throw new Error(`Failed to create subscription plan: ${error.message}`);
    }
  }

  // Create or update a subscription plan
  async upsertSubscriptionPlan(plan) {
    try {
      const planWithTimestamps = addTimestamps(plan);
      const planRef = db.collection(this.plansCollection).doc(plan.id);
      await planRef.set(planWithTimestamps);
      
      const createdPlan = await planRef.get();
      return docToObject(createdPlan);
    } catch (error) {
      throw new Error(`Failed to upsert subscription plan: ${error.message}`);
    }
  }

  // Get subscription plan by ID
  async getSubscriptionPlanById(planId) {
    try {
      const planRef = db.collection(this.plansCollection).doc(planId);
      const planDoc = await planRef.get();
      
      if (!planDoc.exists) {
        return null;
      }
      
      return docToObject(planDoc);
    } catch (error) {
      throw new Error(`Failed to get subscription plan: ${error.message}`);
    }
  }

  // Get all subscription plans with optional filtering and pagination
  async getAllSubscriptionPlans(filters = {}, pagination = {}) {
    try {
      const plansRef = db.collection(this.plansCollection);
      const query = buildQuery(plansRef, filters);
      const snapshot = await query.get();
      const plans = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(plans, pagination.limit, pagination.offset);
      }

      return plans;
    } catch (error) {
      throw new Error(`Failed to get all subscription plans: ${error.message}`);
    }
  }

  // Get active subscription plans only
  async getActiveSubscriptionPlans(pagination = {}) {
    try {
      const plansRef = db.collection(this.plansCollection);
      const query = plansRef.where('isActive', '==', true);
      const snapshot = await query.get();
      const plans = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(plans, pagination.limit, pagination.offset);
      }

      return plans;
    } catch (error) {
      throw new Error(`Failed to get active subscription plans: ${error.message}`);
    }
  }

  // Delete subscription plan by ID
  async deleteSubscriptionPlan(planId) {
    try {
      const planRef = db.collection(this.plansCollection).doc(planId);
      const planDoc = await planRef.get();
      
      if (!planDoc.exists) {
        throw new Error('Subscription plan not found');
      }
      
      await planRef.delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete subscription plan: ${error.message}`);
    }
  }

  // Create a new user subscription (Firebase auto-generates ID)
  async createUserSubscription(subscription) {
    try {
      const subscriptionWithTimestamps = addTimestamps(subscription);
      const subscriptionRef = db.collection(this.collection).doc();
      await subscriptionRef.set(subscriptionWithTimestamps);
      
      const createdSubscription = await subscriptionRef.get();
      return docToObject(createdSubscription);
    } catch (error) {
      throw new Error(`Failed to create user subscription: ${error.message}`);
    }
  }

  // Create or update a user subscription
  async upsertUserSubscription(userId, subscription) {
    try {
      const subscriptionWithTimestamps = addTimestamps(subscription);
      const subscriptionRef = db.collection(this.collection).doc(userId);
      await subscriptionRef.set(subscriptionWithTimestamps);
      
      const createdSubscription = await subscriptionRef.get();
      return docToObject(createdSubscription);
    } catch (error) {
      throw new Error(`Failed to upsert user subscription: ${error.message}`);
    }
  }

  // Get user subscription by user ID
  async getUserSubscriptionById(userId) {
    try {
      const subscriptionRef = db.collection(this.collection).doc(userId);
      const subscriptionDoc = await subscriptionRef.get();
      
      if (!subscriptionDoc.exists) {
        return null;
      }
      
      return docToObject(subscriptionDoc);
    } catch (error) {
      throw new Error(`Failed to get user subscription: ${error.message}`);
    }
  }

  // Get all user subscriptions with optional filtering and pagination
  async getAllUserSubscriptions(filters = {}, pagination = {}) {
    try {
      const subscriptionsRef = db.collection(this.collection);
      const query = buildQuery(subscriptionsRef, filters);
      const snapshot = await query.get();
      const subscriptions = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(subscriptions, pagination.limit, pagination.offset);
      }

      return subscriptions;
    } catch (error) {
      throw new Error(`Failed to get all user subscriptions: ${error.message}`);
    }
  }

  // Get subscriptions by status
  async getSubscriptionsByStatus(status, pagination = {}) {
    try {
      const subscriptionsRef = db.collection(this.collection);
      const query = subscriptionsRef.where('status', '==', status);
      const snapshot = await query.get();
      const subscriptions = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(subscriptions, pagination.limit, pagination.offset);
      }

      return subscriptions;
    } catch (error) {
      throw new Error(`Failed to get subscriptions by status: ${error.message}`);
    }
  }

  // Delete user subscription by user ID
  async deleteUserSubscription(userId) {
    try {
      const subscriptionRef = db.collection(this.collection).doc(userId);
      const subscriptionDoc = await subscriptionRef.get();
      
      if (!subscriptionDoc.exists) {
        throw new Error('User subscription not found');
      }
      
      await subscriptionRef.delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete user subscription: ${error.message}`);
    }
  }

  // Initialize default subscription plans if none exist
  async initializeDefaultPlans() {
    try {
      const existingPlans = await this.getAllSubscriptionPlans();
      
      if (existingPlans.length === 0) {
        console.log('Initializing default subscription plans...');
        
        const defaultPlans = [
          {
            name: 'Starter',
            price: 299,
            ticketLimit: 500,
            productionLimit: 2,
            features: ['Basic seat mapping', 'Payment processing', 'Email support', 'Basic dashboard'],
            isActive: true
          },
          {
            name: 'Professional',
            price: 899,
            ticketLimit: 2500,
            productionLimit: 5,
            features: ['Basic seat mapping', 'Payment processing', 'Email support', 'Basic dashboard', 'Customer database'],
            isActive: true
          },
          {
            name: 'Enterprise',
            price: 1599,
            ticketLimit: -1, // -1 means unlimited
            productionLimit: -1, // -1 means unlimited
            features: ['Basic seat mapping', 'Payment processing', 'Email support', 'Basic dashboard', 'Customer database', 'Multi-location support'],
            isActive: true
          }
        ];

        for (const plan of defaultPlans) {
          await this.createSubscriptionPlan(plan);
        }
        
        console.log('Default subscription plans initialized successfully');
        return defaultPlans;
      }
      
      return existingPlans;
    } catch (error) {
      throw new Error(`Failed to initialize default plans: ${error.message}`);
    }
  }
}

module.exports = new SubscriptionsController();
