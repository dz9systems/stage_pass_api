const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stage-pass-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

// Admin user ID
const ADMIN_UID = 'Rojc9nZcjmNtKnFuPgS6L7asThv1';

// Default subscription plans
const DEFAULT_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    ticketLimit: 500,
    productionLimit: 2,
    features: [
      'Basic seat mapping',
      'Payment processing',
      'Email support',
      'Basic dashboard'
    ],
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: ADMIN_UID
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 899,
    ticketLimit: 2500,
    productionLimit: 5,
    features: [
      'Basic seat mapping',
      'Payment processing',
      'Email support',
      'Basic dashboard',
      'Customer database'
    ],
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: ADMIN_UID
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 1599,
    ticketLimit: -1, // -1 means unlimited
    productionLimit: -1, // -1 means unlimited
    features: [
      'Basic seat mapping',
      'Payment processing',
      'Email support',
      'Basic dashboard',
      'Customer database',
      'Multi-location support'
    ],
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: ADMIN_UID
  }
];

async function setupSubscriptionCollection() {
  try {
    console.log('🔍 Setting up subscription collection for admin:', ADMIN_UID);
    
    // First, verify the admin user exists
    const userDoc = await db.collection('users').doc(ADMIN_UID).get();
    if (!userDoc.exists) {
      console.error('❌ Admin user not found:', ADMIN_UID);
      return;
    }
    
    const userData = userDoc.data();
    console.log('✅ Admin user found:', userData.displayName || userData.email);
    
    // Update user role to admin if not already
    if (userData.role !== 'admin') {
      await db.collection('users').doc(ADMIN_UID).update({
        role: 'admin',
        updatedAt: new Date().toISOString()
      });
      console.log('✅ Updated user role to admin');
    } else {
      console.log('✅ User already has admin role');
    }
    
    // Create subscription plans collection
    const plansCollection = db.collection('subscriptionPlans');
    
    // Check if plans already exist
    const existingPlans = await plansCollection.get();
    if (!existingPlans.empty) {
      console.log('⚠️ Subscription plans already exist, skipping creation');
      console.log('📋 Existing plans:');
      existingPlans.forEach(doc => {
        console.log(`  - ${doc.data().name} (${doc.id})`);
      });
      return;
    }
    
    // Create each plan
    console.log('📝 Creating subscription plans...');
    for (const plan of DEFAULT_PLANS) {
      await plansCollection.doc(plan.id).set(plan);
      console.log(`✅ Created plan: ${plan.name} ($${plan.price}/month)`);
    }
    
    // Create admin's subscription record
    const adminSubscription = {
      userId: ADMIN_UID,
      planId: 'enterprise', // Give admin the enterprise plan
      planName: 'Enterprise',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      createdBy: ADMIN_UID
    };
    
    await db.collection('subscriptions').doc(ADMIN_UID).set(adminSubscription);
    console.log('✅ Created admin subscription record');
    
    console.log('🎉 Subscription collection setup complete!');
    console.log('📊 Summary:');
    console.log(`  - Admin UID: ${ADMIN_UID}`);
    console.log(`  - Plans created: ${DEFAULT_PLANS.length}`);
    console.log(`  - Admin plan: Enterprise (unlimited)`);
    
  } catch (error) {
    console.error('❌ Error setting up subscription collection:', error);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupSubscriptionCollection();
