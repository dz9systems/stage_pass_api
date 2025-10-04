# 🚀 Simple GitHub Actions Setup

This repository uses a simple GitHub Actions workflow for automatic deployment to Firebase.

## 📋 What it does

- **Triggers**: Automatically deploys when you push to the `main` branch
- **Manual**: You can also trigger deployment manually from the GitHub Actions tab
- **Deploys**: 
  - Firestore security rules and indexes
  - Firebase Functions
- **Health Check**: Verifies the deployment was successful

## 🔐 Required Setup

### 1. Set up Firebase CI Token

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Generate CI token
firebase login:ci

# Copy the token and add it to GitHub Secrets
```

### 2. Add GitHub Secret

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `FIREBASE_TOKEN`
5. Value: Paste the token from step 1

## 🚀 How it works

1. **Push to main branch** → GitHub Actions automatically runs
2. **Installs dependencies** → Sets up Node.js and Firebase CLI
3. **Deploys Firestore** → Updates security rules and indexes
4. **Deploys Functions** → Deploys your API to Firebase Functions
5. **Health check** → Verifies the API is working

## 📊 Deployment URLs

After deployment, your API will be available at:
- **Main API**: `https://us-central1-stage-pass-b1d9b.cloudfunctions.net/api`
- **Health Check**: `https://us-central1-stage-pass-b1d9b.cloudfunctions.net/api/`

## 🛠️ Manual Commands

You can also deploy manually:

```bash
# Deploy everything
npm run firebase:deploy-all

# Deploy only functions
npm run firebase:deploy

# Deploy only Firestore rules
npm run firebase:deploy-rules

# Start local development
npm run dev
```

## 🔍 Monitoring

- Check deployment status in the **Actions** tab of your GitHub repository
- View Firebase Functions logs in the [Firebase Console](https://console.firebase.google.com/project/stage-pass-b1d9b/functions)
- Test your API endpoints after deployment

## 🆘 Troubleshooting

### Common Issues:

1. **"Firebase token not found"**
   - Make sure you've added `FIREBASE_TOKEN` to GitHub Secrets
   - Verify the token is valid by running `firebase login:ci` again

2. **"Permission denied"**
   - Check that your Firebase project ID is correct
   - Ensure you have the right permissions in Firebase

3. **"Deployment failed"**
   - Check the Actions logs for specific error messages
   - Verify your Firebase Functions code is correct

### Debug Commands:

```bash
# Test Firebase connection locally
npm run test-firebase

# Check Firebase project
firebase projects:list

# View deployment logs
firebase functions:log
```

---

**That's it! Your simple CI/CD pipeline is ready to go! 🎉**
