const admin = require('firebase-admin');
const Stripe = require('stripe');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || "https://stage-pass-b1d9b-default-rtdb.firebaseio.com/",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "stage-pass-b1d9b.firebasestorage.app"
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "stage-pass-b1d9b",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "stage-pass-b1d9b.firebasestorage.app"
    });
  }
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Default subscription plans with Stripe integration
const DEFAULT_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299, // $2.99
    ticketLimit: 500,
    productionLimit: 2,
    features: [
      'Basic seat mapping',
      'Payment processing',
      'Email support',
      'Basic dashboard'
    ],
    isActive: true
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 899, // $8.99
    ticketLimit: 2500,
    productionLimit: 5,
    features: [
      'Basic seat mapping',
      'Payment processing',
      'Email support',
      'Basic dashboard',
      'Customer database'
    ],
    isActive: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 1599, // $15.99
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
    isActive: true
  }
];

async function setupStripeProducts() {
  try {
    console.log('🔍 Setting up Stripe products and prices...');
    
    const plansCollection = db.collection('subscription_plans');
    
    for (const plan of DEFAULT_PLANS) {
      console.log(`\n📦 Processing plan: ${plan.name}`);
      
      // Check if plan already exists in Firebase
      const existingPlanDoc = await plansCollection.doc(plan.id).get();
      let planData = existingPlanDoc.exists ? existingPlanDoc.data() : plan;
      
      // Create Stripe product if not exists
      if (!planData.stripeProductId) {
        console.log(`  Creating Stripe product for ${plan.name}...`);
        
        const product = await stripe.products.create({
          name: `${plan.name} Plan`,
          description: `Stage Pass ${plan.name} subscription plan`,
          metadata: {
            planId: plan.id,
            ticketLimit: plan.ticketLimit.toString(),
            productionLimit: plan.productionLimit.toString()
          }
        });
        
        planData.stripeProductId = product.id;
        console.log(`  ✅ Created product: ${product.id}`);
      } else {
        console.log(`  ✅ Product already exists: ${planData.stripeProductId}`);
      }
      
      // Create Stripe price if not exists
      if (!planData.stripePriceId) {
        console.log(`  Creating Stripe price for ${plan.name}...`);
        
        const price = await stripe.prices.create({
          product: planData.stripeProductId,
          unit_amount: plan.price, // Price in cents
          currency: 'usd',
          recurring: {
            interval: 'month'
          },
          metadata: {
            planId: plan.id,
            planName: plan.name
          }
        });
        
        planData.stripePriceId = price.id;
        console.log(`  ✅ Created price: ${price.id} ($${(plan.price / 100).toFixed(2)}/month)`);
      } else {
        console.log(`  ✅ Price already exists: ${planData.stripePriceId}`);
      }
      
      // Update Firebase with Stripe IDs
      await plansCollection.doc(plan.id).set({
        ...planData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      console.log(`  ✅ Updated Firebase plan: ${plan.id}`);
    }
    
    console.log('\n🎉 Stripe products and prices setup complete!');
    console.log('\n📊 Summary:');
    
    // Display summary
    const plansSnapshot = await plansCollection.get();
    plansSnapshot.forEach(doc => {
      const plan = doc.data();
      console.log(`  - ${plan.name}: $${(plan.price / 100).toFixed(2)}/month`);
      console.log(`    Product ID: ${plan.stripeProductId}`);
      console.log(`    Price ID: ${plan.stripePriceId}`);
    });
    
    console.log('\n🔗 Next steps:');
    console.log('1. Update your webhook endpoint to handle subscription events');
    console.log('2. Test subscription creation with the new endpoints');
    console.log('3. Configure your frontend to use the new payment flow');
    
  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupStripeProducts();
