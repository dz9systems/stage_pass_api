const { UsersController } = require('../controllers');

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
    }
  }

  // 2) Search by metadata.userId or email
  let customer = null;
  try {
    const parts = [];
    if (userId) parts.push(`metadata['userId']:'${userId}'`);
    if (user.email) parts.push(`email:'${String(user.email).replace(/'/g, "\\'")}'`);
    const query = parts.join(' OR ');
    if (query) {
      const found = await stripe.customers.search({ query });
      if (found?.data?.length) {
        customer = found.data[0];
      }
    }
  } catch (_) {
    // ignore if search not enabled
  }

  // 3) Create if not found (idempotent)
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
  } else if (!customer.metadata?.userId || customer.metadata.userId !== userId) {
    await stripe.customers.update(customer.id, {
      metadata: { ...(customer.metadata || {}), userId }
    });
  }

  if (user.stripeCustomerId !== customer.id) {
    await UsersController.updateUser(userId, { stripeCustomerId: customer.id });
  }

  return customer;
}

module.exports = {
  getOrCreateStripeCustomer
};


