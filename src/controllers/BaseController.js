const { db, admin } = require('../firebase');

// Helper function to convert Firestore document to plain object
function docToObject(doc) {
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// Helper function to convert Firestore documents array to plain objects
function docsToObjects(docs) {
  return docs.map(doc => docToObject(doc));
}

// Helper function to add timestamps
function addTimestamps(data, isUpdate = false) {
  const now = admin.firestore.Timestamp.now();
  if (isUpdate) {
    return { ...data, updatedAt: now };
  }
  return { ...data, createdAt: now, updatedAt: now };
}

// Helper function to generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Helper function to apply pagination
function applyPagination(data, limit = 100, offset = 0) {
  const startIndex = parseInt(offset);
  const endIndex = startIndex + parseInt(limit);
  return {
    data: data.slice(startIndex, endIndex),
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: data.length,
      hasMore: endIndex < data.length
    }
  };
}

// Helper function to build query from filters
function buildQuery(collectionRef, filters = {}) {
  let query = collectionRef;
  
  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'minCapacity') {
        query = query.where('capacity', '>=', parseInt(value));
      } else if (key === 'maxCapacity') {
        query = query.where('capacity', '<=', parseInt(value));
      } else if (key === 'dateFrom') {
        query = query.where('date', '>=', new Date(value));
      } else if (key === 'dateTo') {
        query = query.where('date', '<=', new Date(value));
      } else if (key === 'categories' && Array.isArray(value)) {
        query = query.where('categories', 'array-contains-any', value);
      } else {
        query = query.where(key, '==', value);
      }
    }
  });
  
  return query;
}

module.exports = {
  db,
  admin,
  docToObject,
  docsToObjects,
  addTimestamps,
  generateId,
  applyPagination,
  buildQuery
};
