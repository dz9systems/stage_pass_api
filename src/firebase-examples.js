// Example usage of Firebase client in your frontend application
import { db, auth } from './firebase-client.js';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot 
} from 'firebase/firestore';

// Example: Get all productions
export async function getAllProductions() {
  try {
    const productionsRef = collection(db, 'productions');
    const snapshot = await getDocs(productionsRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting productions:', error);
    throw error;
  }
}

// Example: Get productions by seller
export async function getProductionsBySeller(sellerId) {
  try {
    const productionsRef = collection(db, 'productions');
    const q = query(productionsRef, where('sellerId', '==', sellerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting productions by seller:', error);
    throw error;
  }
}

// Example: Create a new production
export async function createProduction(productionData) {
  try {
    const productionsRef = collection(db, 'productions');
    const docRef = await addDoc(productionsRef, {
      ...productionData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return { id: docRef.id, ...productionData };
  } catch (error) {
    console.error('Error creating production:', error);
    throw error;
  }
}

// Example: Update a production
export async function updateProduction(productionId, updateData) {
  try {
    const productionRef = doc(db, 'productions', productionId);
    await updateDoc(productionRef, {
      ...updateData,
      updatedAt: new Date()
    });
    return { id: productionId, ...updateData };
  } catch (error) {
    console.error('Error updating production:', error);
    throw error;
  }
}

// Example: Real-time listener for productions
export function subscribeToProductions(callback) {
  const productionsRef = collection(db, 'productions');
  const q = query(productionsRef, orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const productions = snapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));
    callback(productions);
  });
}

// Example: Get performances for a production
export async function getPerformances(productionId) {
  try {
    const performancesRef = collection(db, 'productions', productionId, 'performances');
    const q = query(performancesRef, orderBy('date', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting performances:', error);
    throw error;
  }
}

// Example: Get venues with filters
export async function getVenues(filters = {}) {
  try {
    const venuesRef = collection(db, 'venues');
    let q = query(venuesRef);
    
    if (filters.city) {
      q = query(q, where('city', '==', filters.city));
    }
    
    if (filters.minCapacity) {
      q = query(q, where('capacity', '>=', parseInt(filters.minCapacity)));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting venues:', error);
    throw error;
  }
}

// Example: Get user's orders
export async function getUserOrders(userId) {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef, 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting user orders:', error);
    throw error;
  }
}

// Example: Authentication helper
export function getCurrentUser() {
  return auth.currentUser;
}

// Example: Listen to auth state changes
export function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}
