#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔥 Stage Pass API - Firebase Setup');
console.log('=====================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file...');
  const envTemplate = `# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Configuration
FIREBASE_PROJECT_ID=stage-pass-b1d9b
FIREBASE_DATABASE_URL=https://stage-pass-b1d9b-default-rtdb.firebaseio.com/
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"stage-pass-b1d9b",...}
# OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Application URLs
API_BASE_URL=http://localhost:4242
APP_BASE_URL=http://localhost:5173

# Server Configuration
PORT=4242
`;
  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ .env file created. Please update with your actual values.\n');
} else {
  console.log('✅ .env file already exists.\n');
}

// Check if Firebase CLI is installed
console.log('🔍 Checking Firebase CLI installation...');
const { execSync } = require('child_process');
try {
  execSync('firebase --version', { stdio: 'pipe' });
  console.log('✅ Firebase CLI is installed.\n');
} catch (error) {
  console.log('❌ Firebase CLI not found. Installing...');
  try {
    execSync('npm install -g firebase-tools', { stdio: 'inherit' });
    console.log('✅ Firebase CLI installed successfully.\n');
  } catch (installError) {
    console.log('❌ Failed to install Firebase CLI. Please run: npm install -g firebase-tools\n');
  }
}

console.log('📋 Next Steps:');
console.log('1. Create a Firebase project at https://console.firebase.google.com/');
console.log('2. Enable Firestore Database');
console.log('3. Get your service account key from Project Settings > Service Accounts');
console.log('4. Update the .env file with your Firebase configuration');
console.log('5. Run: firebase login');
console.log('6. Run: firebase init (select Firestore and Functions)');
console.log('7. Run: firebase deploy --only firestore:rules,firestore:indexes');
console.log('8. Run: npm start (for local development)');
console.log('9. Or run: firebase emulators:start (for Firebase emulator)');

console.log('\n🎉 Setup complete! Happy coding!');
