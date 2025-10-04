# 🔍 Firestore Indexes Guide

This guide explains how to create and manage Firestore indexes for your Stage Pass API.

## 📋 What are Firestore Indexes?

Firestore indexes are data structures that make your queries faster. They're required for:
- **Compound queries** (multiple fields)
- **Range queries** (>, >=, <, <=)
- **Array queries** (array-contains, array-contains-any)
- **Ordering** (orderBy)

## 🚀 How to Deploy Indexes

### Method 1: Deploy with GitHub Actions (Recommended)
```bash
# Push to main branch - indexes deploy automatically
git add firestore.indexes.json
git commit -m "Add Firestore indexes"
git push origin main
```

### Method 2: Deploy Manually
```bash
# Deploy only indexes
npm run firebase:deploy-rules

# Or deploy everything
npm run firebase:deploy-all
```

### Method 3: Firebase CLI
```bash
# Deploy indexes only
firebase deploy --only firestore:indexes

# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes
```

## 📊 Current Indexes in Your Project

### Users Collection
- `role` + `createdAt` (for filtering by role with pagination)
- `role` (for role-based queries)

### Productions Collection
- `sellerId` + `status` + `createdAt` (for seller's productions)
- `categories` + `status` (for category filtering)
- `status` + `featured` (for featured productions)
- `categories` + `featured` (for featured by category)

### Performances Collection (Subcollection)
- `status` + `date` (for status and date filtering)
- `venueId` + `date` (for venue-specific performances)
- `status` + `venueId` + `date` (for complex venue queries)

### Venues Collection
- `sellerId` + `city` (for seller's venues by city)
- `capacity` + `city` (for capacity filtering by city)
- `capacity` + `state` (for capacity filtering by state)

### Orders Collection
- `userId` + `status` + `createdAt` (for user's orders)
- `sellerId` + `status` + `createdAt` (for seller's orders)
- `productionId` + `createdAt` (for production-specific orders)
- `performanceId` + `createdAt` (for performance-specific orders)
- `paymentStatus` + `createdAt` (for payment status filtering)
- `userId` + `paymentStatus` + `createdAt` (for user payment queries)
- `sellerId` + `paymentStatus` + `createdAt` (for seller payment queries)

### Tickets Collection (Subcollection)
- `status` + `section` (for ticket status and section filtering)

## 🔧 How to Add New Indexes

### 1. Identify the Query
When you write a query like this:
```javascript
// This needs an index
db.collection('productions')
  .where('status', '==', 'active')
  .where('featured', '==', true)
  .orderBy('createdAt', 'desc')
```

### 2. Add to firestore.indexes.json
```json
{
  "collectionGroup": "productions",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "featured",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```

### 3. Deploy the Index
```bash
npm run firebase:deploy-rules
```

## 🚨 Common Index Requirements

### Range Queries
```javascript
// Needs index: capacity + createdAt
.where('capacity', '>=', 100)
.where('capacity', '<=', 500)
.orderBy('createdAt', 'desc')
```

### Array Queries
```javascript
// Needs index: categories (array-contains)
.where('categories', 'array-contains', 'drama')

// Needs index: categories (array-contains-any)
.where('categories', 'array-contains-any', ['drama', 'comedy'])
```

### Compound Queries
```javascript
// Needs index: status + featured + createdAt
.where('status', '==', 'active')
.where('featured', '==', true)
.orderBy('createdAt', 'desc')
```

## 📈 Performance Tips

### 1. Order Matters
- Put equality filters first
- Then range filters
- OrderBy last

### 2. Limit Indexes
- Only create indexes for queries you actually use
- Each index costs storage and write time

### 3. Use Collection Group Queries Sparingly
- `COLLECTION_GROUP` indexes are more expensive
- Use them only when you need to query across all subcollections

## 🔍 Monitoring Index Usage

### Check Index Status
1. Go to [Firebase Console](https://console.firebase.google.com/project/stage-pass-b1d9b)
2. Navigate to **Firestore Database** → **Indexes**
3. Check the status of your indexes

### Common Statuses
- ✅ **Enabled**: Index is ready to use
- 🟡 **Building**: Index is being created (can take time)
- ❌ **Error**: Index creation failed

## 🛠️ Troubleshooting

### "Index not found" Error
1. Check if the index exists in `firestore.indexes.json`
2. Deploy the indexes: `npm run firebase:deploy-rules`
3. Wait for the index to build (can take several minutes)

### Slow Queries
1. Check if you have the right index
2. Look at the query execution plan in Firebase Console
3. Consider adding a composite index

### Index Build Failures
1. Check the Firebase Console for error messages
2. Verify the index syntax in `firestore.indexes.json`
3. Make sure all referenced fields exist in your documents

## 📝 Best Practices

1. **Start Simple**: Begin with single-field indexes
2. **Add as Needed**: Create composite indexes when you need them
3. **Test Locally**: Use Firebase emulator to test queries
4. **Monitor Performance**: Check query performance in production
5. **Clean Up**: Remove unused indexes to save costs

## 🚀 Quick Commands

```bash
# Deploy indexes
npm run firebase:deploy-rules

# Start emulator (for testing)
npm run firebase:emulators

# Check Firebase project
firebase projects:list

# View logs
firebase functions:log
```

---

**Your indexes are now optimized for all the queries in your Stage Pass API! 🎉**
