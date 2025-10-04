# 🔥 Firebase Integration Setup Guide

## Your Firebase Project Details
- **Project ID**: `stage-pass-b1d9b`
- **Project URL**: https://console.firebase.google.com/project/stage-pass-b1d9b
- **Database URL**: `https://stage-pass-b1d9b-default-rtdb.firebaseio.com/`

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Firebase Service Account
1. Go to [Firebase Console](https://console.firebase.google.com/project/stage-pass-b1d9b)
2. Navigate to **Project Settings** > **Service Accounts**
3. Click **Generate New Private Key**
4. Download the JSON file
5. Set the environment variable:

**Option A: Environment Variable**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

**Option B: .env File**
Add to your `.env` file:
```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"stage-pass-b1d9b",...}
```

### 3. Enable Firestore Database
1. Go to [Firebase Console](https://console.firebase.google.com/project/stage-pass-b1d9b)
2. Navigate to **Firestore Database**
3. Click **Create Database**
4. Choose **Start in test mode** (for development)
5. Select a location (choose closest to your users)

### 4. Test Firebase Connection
```bash
npm run test-firebase
```

### 5. Start the API
```bash
npm start
```

## 🛠️ Development Options

### Option 1: Local Development with Firebase
```bash
npm start
# API runs on http://localhost:4242
# Uses your live Firebase project
```

### Option 2: Firebase Emulator (Recommended for Development)
```bash
npm run firebase:emulators
# API runs on http://localhost:5001/stage-pass-b1d9b/us-central1/api
# Uses local emulator (no live data)
```

## 📁 Project Structure

```
stage_pass_api/
├── src/
│   ├── firebase.js              # Server-side Firebase config
│   ├── firebase-client.js       # Client-side Firebase config
│   ├── firebaseDb.js            # Database operations
│   ├── firebase-examples.js     # Frontend usage examples
│   └── routes/                  # API routes (updated for Firebase)
├── functions/                   # Firebase Functions
│   ├── index.js                 # Functions entry point
│   └── package.json             # Functions dependencies
├── firebase.json                # Firebase configuration
├── firestore.rules              # Security rules
├── firestore.indexes.json       # Database indexes
└── .firebaserc                  # Project configuration
```

## 🔐 Security Rules

The Firestore security rules are configured in `firestore.rules`:

- **Users**: Can only read/write their own data
- **Productions**: Public read, sellers can manage their own
- **Venues**: Public read, sellers can manage their own
- **Orders**: Users and sellers can access relevant orders
- **Subcollections**: Inherit permissions from parent documents

## 🚀 Deployment

### Deploy Security Rules and Indexes
```bash
npm run firebase:deploy-rules
```

### Deploy Firebase Functions
```bash
npm run firebase:deploy
```

### Deploy Everything
```bash
firebase deploy
```

## 📊 Database Schema

### Collections
- `users` - User accounts (Document ID: Firebase Auth UID)
- `productions` - Theater productions
- `venues` - Theater venues
- `orders` - Customer orders
- `theaters` - Legacy theater data

### Subcollections
- `productions/{id}/performances` - Performance dates/times
- `venues/{id}/seatmaps` - Seating configurations
- `orders/{id}/tickets` - Individual tickets

## 🔧 Environment Variables

Create a `.env` file with:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Configuration
FIREBASE_PROJECT_ID=stage-pass-b1d9b
FIREBASE_DATABASE_URL=https://stage-pass-b1d9b-default-rtdb.firebaseio.com/
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Application URLs
API_BASE_URL=http://localhost:4242
APP_BASE_URL=http://localhost:5173

# Server Configuration
PORT=4242
```

## 🧪 Testing

### Test Firebase Connection
```bash
npm run test-firebase
```

### Test API Endpoints
```bash
# Start the server
npm start

# Test in another terminal
curl http://localhost:4242/api/users
curl http://localhost:4242/api/productions
```

## 📱 Frontend Integration

Use the client-side Firebase config in your frontend:

```javascript
import { db, auth } from './src/firebase-client.js';
import { collection, getDocs } from 'firebase/firestore';

// Get all productions
const productionsRef = collection(db, 'productions');
const snapshot = await getDocs(productionsRef);
const productions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```

## 🆘 Troubleshooting

### Common Issues

1. **"Firebase connection failed"**
   - Check your service account key
   - Ensure Firestore is enabled
   - Verify project ID is correct

2. **"Permission denied"**
   - Check Firestore security rules
   - Ensure user is authenticated
   - Verify document ownership

3. **"Function not found"**
   - Deploy Firebase Functions
   - Check function names in firebase.json

### Getting Help

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Functions](https://firebase.google.com/docs/functions)

## ✅ Next Steps

1. ✅ Firebase project configured
2. ✅ Firestore database enabled
3. ✅ Security rules deployed
4. ✅ API routes updated for Firebase
5. ✅ Client-side config ready
6. 🔄 Deploy to production
7. 🔄 Set up authentication
8. 🔄 Configure monitoring

Your Stage Pass API is now fully integrated with Firebase! 🎉
