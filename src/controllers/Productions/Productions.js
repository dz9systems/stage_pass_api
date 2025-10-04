const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class ProductionsController {
  constructor() {
    this.collection = 'productions';
  }

  // Create or update a production
  async upsertProduction(production) {
    try {
      const productionData = addTimestamps(production, !!production.id);
      const productionRef = db.collection(this.collection).doc(production.id);
      await productionRef.set(productionData, { merge: true });
      return productionData;
    } catch (error) {
      throw new Error(`Failed to upsert production: ${error.message}`);
    }
  }

  // Get production by ID
  async getProductionById(productionId) {
    try {
      const productionDoc = await db.collection(this.collection).doc(productionId).get();
      return docToObject(productionDoc);
    } catch (error) {
      throw new Error(`Failed to get production by ID: ${error.message}`);
    }
  }

  // Get all productions with optional filtering and pagination
  async getAllProductions(filters = {}, pagination = {}) {
    try {
      const productionsRef = db.collection(this.collection);
      const query = buildQuery(productionsRef, filters);
      const snapshot = await query.get();
      const productions = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(productions, pagination.limit, pagination.offset);
      }
      
      return productions;
    } catch (error) {
      throw new Error(`Failed to get all productions: ${error.message}`);
    }
  }

  // Get productions by seller ID
  async getProductionsBySellerId(sellerId, filters = {}, pagination = {}) {
    try {
      const productionsRef = db.collection(this.collection);
      const query = productionsRef.where('sellerId', '==', sellerId);
      
      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'categories' && Array.isArray(value)) {
            query.where('categories', 'array-contains-any', value);
          } else {
            query.where(key, '==', value);
          }
        }
      });
      
      const snapshot = await query.get();
      const productions = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(productions, pagination.limit, pagination.offset);
      }
      
      return productions;
    } catch (error) {
      throw new Error(`Failed to get productions by seller ID: ${error.message}`);
    }
  }

  // Get productions by category
  async getProductionsByCategory(category, pagination = {}) {
    try {
      return await this.getAllProductions({ categories: [category] }, pagination);
    } catch (error) {
      throw new Error(`Failed to get productions by category: ${error.message}`);
    }
  }

  // Get productions by status
  async getProductionsByStatus(status, pagination = {}) {
    try {
      return await this.getAllProductions({ status }, pagination);
    } catch (error) {
      throw new Error(`Failed to get productions by status: ${error.message}`);
    }
  }

  // Search productions by title or description
  async searchProductions(searchTerm, pagination = {}) {
    try {
      const productionsRef = db.collection(this.collection);
      const snapshot = await productionsRef.get();
      const productions = docsToObjects(snapshot.docs);
      
      // Filter by search term (case insensitive)
      const filteredProductions = productions.filter(production => 
        production.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        production.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        production.categories?.some(cat => cat.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredProductions, pagination.limit, pagination.offset);
      }
      
      return filteredProductions;
    } catch (error) {
      throw new Error(`Failed to search productions: ${error.message}`);
    }
  }

  // Update production
  async updateProduction(productionId, updateData) {
    try {
      const productionRef = db.collection(this.collection).doc(productionId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await productionRef.update(updateDataWithTimestamp);
      return { id: productionId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update production: ${error.message}`);
    }
  }

  // Delete production
  async deleteProduction(productionId) {
    try {
      await db.collection(this.collection).doc(productionId).delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete production: ${error.message}`);
    }
  }

  // Get production statistics
  async getProductionStats(sellerId = null) {
    try {
      const productionsRef = db.collection(this.collection);
      let query = productionsRef;
      
      if (sellerId) {
        query = query.where('sellerId', '==', sellerId);
      }
      
      const snapshot = await query.get();
      const productions = docsToObjects(snapshot.docs);
      
      const stats = {
        total: productions.length,
        active: productions.filter(p => p.status === 'active').length,
        draft: productions.filter(p => p.status === 'draft').length,
        archived: productions.filter(p => p.status === 'archived').length,
        categories: [...new Set(productions.flatMap(p => p.categories || []))],
        averagePrice: productions.reduce((sum, p) => sum + (p.priceRange?.min || 0), 0) / productions.length || 0
      };
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get production stats: ${error.message}`);
    }
  }

  // Get featured productions
  async getFeaturedProductions(limit = 10) {
    try {
      const productionsRef = db.collection(this.collection);
      const query = productionsRef
        .where('status', '==', 'active')
        .where('featured', '==', true)
        .limit(limit);
      
      const snapshot = await query.get();
      return docsToObjects(snapshot.docs);
    } catch (error) {
      throw new Error(`Failed to get featured productions: ${error.message}`);
    }
  }
}

module.exports = new ProductionsController();
