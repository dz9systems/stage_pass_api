# 🚀 CI/CD Pipeline Documentation

This document explains the GitHub Actions CI/CD pipeline setup for the Stage Pass API.

## 📋 Overview

The CI/CD pipeline includes:
- **Code Quality**: Linting, formatting, security scanning
- **Testing**: Unit tests, integration tests, Firebase connection tests
- **Deployment**: Automated deployment to staging and production
- **Database Management**: Backup, migration, and maintenance operations
- **Performance Testing**: Load testing and performance monitoring

## 🔧 Workflows

### 1. Main CI/CD Pipeline (`.github/workflows/ci-cd.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Jobs:**
- `lint-and-test`: Code quality checks and testing
- `deploy-staging`: Deploy to staging (develop branch)
- `deploy-production`: Deploy to production (main branch)
- `security-scan`: Security vulnerability scanning
- `performance-test`: Performance testing (staging only)

### 2. Firebase Deploy (`.github/workflows/firebase-deploy.yml`)

**Triggers:**
- Manual workflow dispatch

**Features:**
- Choose environment (staging/production)
- Select what to deploy (functions, firestore rules, or both)
- Health checks after deployment

### 3. Code Quality (`.github/workflows/quality.yml`)

**Triggers:**
- Push/PR to main/develop branches
- Weekly schedule (Mondays at 2 AM)

**Checks:**
- ESLint code analysis
- Prettier formatting check
- Console.log detection
- TODO comment tracking
- Code coverage generation
- Dependency security audit

### 4. Database Maintenance (`.github/workflows/database.yml`)

**Triggers:**
- Manual workflow dispatch

**Operations:**
- Database backup
- Data migration
- Cleanup operations
- Structure validation

## 🔐 Required Secrets

Set these secrets in your GitHub repository settings:

### Required Secrets:
```bash
FIREBASE_TOKEN                    # Firebase CI token
FIREBASE_SERVICE_ACCOUNT_KEY      # Service account JSON
```

### Optional Secrets:
```bash
SNYK_TOKEN                       # Snyk security scanning
GITHUB_TOKEN                     # Auto-generated for releases
```

## 🚀 Getting Started

### 1. Set up Firebase CI Token

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Generate CI token
firebase login:ci

# Copy the token and add it to GitHub Secrets as FIREBASE_TOKEN
```

### 2. Set up Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/project/stage-pass-b1d9b)
2. Navigate to Project Settings > Service Accounts
3. Generate a new private key
4. Copy the JSON content
5. Add it to GitHub Secrets as `FIREBASE_SERVICE_ACCOUNT_KEY`

### 3. Configure Environments

1. Go to your GitHub repository
2. Click Settings > Environments
3. Create environments:
   - `staging` (no protection rules)
   - `production` (require manual approval)

## 📊 Pipeline Stages

### Development Flow:
```
Code Push → Lint & Test → Deploy to Staging → Performance Test
```

### Production Flow:
```
Merge to Main → Lint & Test → Deploy to Production → Create Release
```

### Manual Operations:
```
Database Backup/Migration → Security Scan → Performance Test
```

## 🛠️ Available Scripts

### Development:
```bash
npm run dev              # Start development server
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Format code with Prettier
npm run test-firebase    # Test Firebase connection
```

### Deployment:
```bash
npm run firebase:deploy          # Deploy functions only
npm run firebase:deploy-rules    # Deploy Firestore rules
npm run firebase:deploy-all      # Deploy everything
npm run firebase:backup          # Backup database
```

### Quality:
```bash
npm run security:audit   # Check for vulnerabilities
npm run security:fix     # Fix security issues
npm run deps:check       # Check for outdated packages
npm run deps:update      # Update packages
```

## 🔍 Monitoring

### Deployment URLs:
- **Staging**: `https://us-central1-stage-pass-b1d9b.cloudfunctions.net/api`
- **Production**: `https://us-central1-stage-pass-b1d9b.cloudfunctions.net/api`

### Health Check Endpoints:
- `GET /` - Basic health check
- `GET /api/users` - Users API health
- `GET /api/productions` - Productions API health

## 🚨 Troubleshooting

### Common Issues:

1. **Firebase Token Expired**
   ```bash
   firebase login:ci
   # Update FIREBASE_TOKEN secret
   ```

2. **Service Account Permissions**
   - Ensure service account has proper Firestore and Functions permissions
   - Check IAM roles in Google Cloud Console

3. **Deployment Failures**
   - Check Firebase project ID matches
   - Verify all required secrets are set
   - Check Firebase Functions logs

4. **Test Failures**
   - Ensure Firebase emulator is running for local tests
   - Check environment variables are set correctly

### Debug Commands:
```bash
# Test Firebase connection locally
npm run test-firebase

# Run linting locally
npm run lint

# Check code formatting
npm run format:check

# Test security audit
npm run security:audit
```

## 📈 Performance Monitoring

The pipeline includes performance testing with Artillery:
- Load testing with 10 users, 5 requests each
- Response time monitoring
- Error rate tracking

## 🔒 Security Features

- **Dependency Scanning**: Automated vulnerability detection
- **Code Analysis**: ESLint security rules
- **Secret Management**: Secure secret storage
- **Access Control**: Environment-based permissions

## 📝 Best Practices

1. **Always test locally** before pushing
2. **Use feature branches** for new features
3. **Review PRs** before merging to main
4. **Monitor deployments** for issues
5. **Keep dependencies updated**
6. **Use semantic versioning** for releases

## 🆘 Support

If you encounter issues with the CI/CD pipeline:

1. Check the GitHub Actions logs
2. Verify all secrets are correctly set
3. Test Firebase connection locally
4. Review Firebase Functions logs
5. Check environment configurations

---

**Happy Deploying! 🚀**
