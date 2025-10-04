// Quick test script to verify Firebase connection
const { db } = require('./src/firebase');

async function testFirebaseConnection() {
  try {
    console.log('🔥 Testing Firebase connection...');
    
    // Test basic Firestore connection
    const testRef = db.collection('test');
    await testRef.add({
      message: 'Firebase connection test',
      timestamp: new Date()
    });
    
    console.log('✅ Firebase connection successful!');
    console.log('✅ Firestore is accessible');
    console.log('✅ Ready to use the API');
    
    // Clean up test document
    const snapshot = await testRef.where('message', '==', 'Firebase connection test').get();
    snapshot.forEach(doc => {
      doc.ref.delete();
    });
    
  } catch (error) {
    console.error('❌ Firebase connection failed:', error.message);
    console.log('\n📋 Make sure you have:');
    console.log('1. Set up your Firebase project');
    console.log('2. Enabled Firestore Database');
    console.log('3. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env file');
    console.log('4. Or set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  }
}

testFirebaseConnection();
