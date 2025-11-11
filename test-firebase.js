// Quick test script to verify Firebase connection
const { db } = require('./src/firebase');

async function testFirebaseConnection() {
  try {
    
    // Test basic Firestore connection
    const testRef = db.collection('test');
    await testRef.add({
      message: 'Firebase connection test',
      timestamp: new Date()
    });
    
    
    // Clean up test document
    const snapshot = await testRef.where('message', '==', 'Firebase connection test').get();
    snapshot.forEach(doc => {
      doc.ref.delete();
    });
    
  } catch (error) {
    
  }
}

testFirebaseConnection();
