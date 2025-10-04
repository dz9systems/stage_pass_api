const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class UsersController {
  constructor() {
    this.collection = 'users';
  }

  // Create or update a user
  async upsertUser(user) {
    try {
      const userData = addTimestamps(user, !!user.id);
      const userRef = db.collection(this.collection).doc(user.id);
      await userRef.set(userData, { merge: true });
      return userData;
    } catch (error) {
      throw new Error(`Failed to upsert user: ${error.message}`);
    }
  }

  // Get user by ID
  async getUserById(userId) {
    try {
      const userDoc = await db.collection(this.collection).doc(userId).get();
      return docToObject(userDoc);
    } catch (error) {
      throw new Error(`Failed to get user by ID: ${error.message}`);
    }
  }

  // Get all users with optional filtering and pagination
  async getAllUsers(filters = {}, pagination = {}) {
    try {
      const usersRef = db.collection(this.collection);
      const query = buildQuery(usersRef, filters);
      const snapshot = await query.get();
      const users = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(users, pagination.limit, pagination.offset);
      }
      
      return users;
    } catch (error) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  // Get users by role
  async getUsersByRole(role, pagination = {}) {
    try {
      return await this.getAllUsers({ role }, pagination);
    } catch (error) {
      throw new Error(`Failed to get users by role: ${error.message}`);
    }
  }

  // Update user
  async updateUser(userId, updateData) {
    try {
      const userRef = db.collection(this.collection).doc(userId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await userRef.update(updateDataWithTimestamp);
      return { id: userId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  // Delete user
  async deleteUser(userId) {
    try {
      await db.collection(this.collection).doc(userId).delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  // Search users by name or email
  async searchUsers(searchTerm, pagination = {}) {
    try {
      const usersRef = db.collection(this.collection);
      const snapshot = await usersRef.get();
      const users = docsToObjects(snapshot.docs);
      
      // Filter by search term (case insensitive)
      const filteredUsers = users.filter(user => 
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredUsers, pagination.limit, pagination.offset);
      }
      
      return filteredUsers;
    } catch (error) {
      throw new Error(`Failed to search users: ${error.message}`);
    }
  }

  // Get user statistics
  async getUserStats() {
    try {
      const usersRef = db.collection(this.collection);
      const snapshot = await usersRef.get();
      const users = docsToObjects(snapshot.docs);
      
      const stats = {
        total: users.length,
        customers: users.filter(user => user.role === 'customer').length,
        sellers: users.filter(user => user.role === 'seller').length,
        admins: users.filter(user => user.role === 'admin').length,
        active: users.filter(user => user.status === 'active').length,
        inactive: users.filter(user => user.status === 'inactive').length
      };
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get user stats: ${error.message}`);
    }
  }
}

module.exports = new UsersController();
