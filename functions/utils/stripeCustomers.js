const { UsersController } = require('../controllers');

/**
 * Get or create a Stripe Customer for a given userId in an idempotent way.
 * Ensures:
 * - We reuse stored user.stripeCustomerId when valid
 * - We search by metadata.userId or email to avoid duplicates
 * - We set metadata.userId on the customer
 * - We persist stripeCustomerId back to the user record
 */
async function getOrCreateStripeCustomer(stripe, userId) {
  const user = await UsersController.getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // 1) Reuse if we already stored a stripeCustomerId
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (existing && !existing.deleted) {
        // Ensure metadata has userId for future lookups
        if (!existing.metadata || existing.metadata.userId !== userId) {
          await stripe.customers.update(existing.id, {
            metadata: { ...(existing.metadata || {}), userId }
          });
        }
        return existing;
      }
    } catch (err) {
      if (!err || err.code !== 'resource_missing') {
        throw err;
      }
      // Fall through to search/create if resource missing
    }
  }

  // 2) Search in Stripe by metadata.userId or email to prevent duplicates
  let customer = null;
  try {
    const queryParts = [];
    if (userId) queryParts.push(`metadata['userId']:'${userId}'`);
    if (user.email) queryParts.push(`email:'${String(user.email).replace(/'/g, "\\'")}'`);
    const query = queryParts.join(' OR ');
    if (query) {
      const search = await stripe.customers.search({ query });
      if (search && search.data && search.data.length > 0) {
        customer = search.data[0];
      }
    }
  } catch (err) {
    // Ignore if search API not enabled; proceed to create
  }

  // 3) Create if still not found (use idempotency key)
  if (!customer) {
    const idempotencyKey = `customer_create_user_${userId}`;
    customer = await stripe.customers.create(
      {
        email: user.email,
        name: user.displayName || user.email,
        metadata: { userId }
      },
      { idempotencyKey }
    );
  } else {
    // Ensure metadata has userId for future lookups
    if (!customer.metadata || customer.metadata.userId !== userId) {
      await stripe.customers.update(customer.id, {
        metadata: { ...(customer.metadata || {}), userId }
      });
    }
  }

  // Persist the customer id on the user if not set or changed
  if (!user.stripeCustomerId || user.stripeCustomerId !== customer.id) {
    await UsersController.updateUser(userId, { stripeCustomerId: customer.id });
  }

  return customer;
}

module.exports = {
  getOrCreateStripeCustomer
};


