const admin = require('firebase-admin');

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
    // For local development, you can use the Firebase emulator
    // or set GOOGLE_APPLICATION_CREDENTIALS environment variable
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "stage-pass-b1d9b",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "stage-pass-b1d9b.firebasestorage.app"
    });
  }
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth
};
