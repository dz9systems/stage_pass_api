const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class PerformancesController {
  constructor() {
    this.parentCollection = 'productions';
    this.subcollection = 'performances';
  }

  // Create or update a performance
  async upsertPerformance(productionId, performance) {
    try {
      const performanceData = addTimestamps(performance, !!performance.id);
      const performanceRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection)
        .doc(performance.id);
      await performanceRef.set(performanceData, { merge: true });
      return performanceData;
    } catch (error) {
      throw new Error(`Failed to upsert performance: ${error.message}`);
    }
  }

  // Get performance by ID
  async getPerformanceById(productionId, performanceId) {
    try {
      const performanceDoc = await db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection)
        .doc(performanceId)
        .get();
      return docToObject(performanceDoc);
    } catch (error) {
      throw new Error(`Failed to get performance by ID: ${error.message}`);
    }
  }

  // Get all performances for a production
  async getAllPerformances(productionId, filters = {}, pagination = {}) {
    try {
      const performancesRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection);
      
      let query = performancesRef;
      
      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'status') {
            query = query.where('status', '==', value);
          } else if (key === 'dateFrom') {
            query = query.where('date', '>=', new Date(value));
          } else if (key === 'dateTo') {
            query = query.where('date', '<=', new Date(value));
          } else if (key === 'venueId') {
            query = query.where('venueId', '==', value);
          }
        }
      });
      
      const snapshot = await query.orderBy('date', 'asc').get();
      const performances = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(performances, pagination.limit, pagination.offset);
      }
      
      return performances;
    } catch (error) {
      throw new Error(`Failed to get all performances: ${error.message}`);
    }
  }

  // Get performances by status
  async getPerformancesByStatus(productionId, status, pagination = {}) {
    try {
      return await this.getAllPerformances(productionId, { status }, pagination);
    } catch (error) {
      throw new Error(`Failed to get performances by status: ${error.message}`);
    }
  }

  // Get performances by date range
  async getPerformancesByDateRange(productionId, startDate, endDate, pagination = {}) {
    try {
      return await this.getAllPerformances(productionId, { 
        dateFrom: startDate, 
        dateTo: endDate 
      }, pagination);
    } catch (error) {
      throw new Error(`Failed to get performances by date range: ${error.message}`);
    }
  }

  // Get upcoming performances
  async getUpcomingPerformances(productionId, pagination = {}) {
    try {
      const now = new Date();
      return await this.getAllPerformances(productionId, { 
        dateFrom: now.toISOString(),
        status: 'active'
      }, pagination);
    } catch (error) {
      throw new Error(`Failed to get upcoming performances: ${error.message}`);
    }
  }

  // Get past performances
  async getPastPerformances(productionId, pagination = {}) {
    try {
      const now = new Date();
      return await this.getAllPerformances(productionId, { 
        dateTo: now.toISOString()
      }, pagination);
    } catch (error) {
      throw new Error(`Failed to get past performances: ${error.message}`);
    }
  }

  // Get performances by venue
  async getPerformancesByVenue(productionId, venueId, pagination = {}) {
    try {
      return await this.getAllPerformances(productionId, { venueId }, pagination);
    } catch (error) {
      throw new Error(`Failed to get performances by venue: ${error.message}`);
    }
  }

  // Update performance
  async updatePerformance(productionId, performanceId, updateData) {
    try {
      const performanceRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection)
        .doc(performanceId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await performanceRef.update(updateDataWithTimestamp);
      return { id: performanceId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update performance: ${error.message}`);
    }
  }

  // Update performance status
  async updatePerformanceStatus(productionId, performanceId, status) {
    try {
      return await this.updatePerformance(productionId, performanceId, { status });
    } catch (error) {
      throw new Error(`Failed to update performance status: ${error.message}`);
    }
  }

  // Cancel performance
  async cancelPerformance(productionId, performanceId, reason = null) {
    try {
      const updateData = { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason
      };
      return await this.updatePerformance(productionId, performanceId, updateData);
    } catch (error) {
      throw new Error(`Failed to cancel performance: ${error.message}`);
    }
  }

  // Delete performance
  async deletePerformance(productionId, performanceId) {
    try {
      await db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection)
        .doc(performanceId)
        .delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete performance: ${error.message}`);
    }
  }

  // Get performance statistics
  async getPerformanceStats(productionId) {
    try {
      const performancesRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection);
      
      const snapshot = await performancesRef.get();
      const performances = docsToObjects(snapshot.docs);
      
      const now = new Date();
      const stats = {
        total: performances.length,
        active: performances.filter(p => p.status === 'active').length,
        cancelled: performances.filter(p => p.status === 'cancelled').length,
        completed: performances.filter(p => p.status === 'completed').length,
        upcoming: performances.filter(p => new Date(p.date) > now).length,
        past: performances.filter(p => new Date(p.date) <= now).length,
        totalCapacity: performances.reduce((sum, p) => sum + (p.capacity || 0), 0),
        averageCapacity: performances.length > 0 
          ? performances.reduce((sum, p) => sum + (p.capacity || 0), 0) / performances.length 
          : 0,
        venues: [...new Set(performances.map(p => p.venueId).filter(Boolean))]
      };
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get performance stats: ${error.message}`);
    }
  }

  // Get next performance
  async getNextPerformance(productionId) {
    try {
      const now = new Date();
      const performancesRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection);
      
      const query = performancesRef
        .where('date', '>', now)
        .where('status', '==', 'active')
        .orderBy('date', 'asc')
        .limit(1);
      
      const snapshot = await query.get();
      return snapshot.docs.length > 0 ? docToObject(snapshot.docs[0]) : null;
    } catch (error) {
      throw new Error(`Failed to get next performance: ${error.message}`);
    }
  }

  // Search performances by name or description
  async searchPerformances(productionId, searchTerm, pagination = {}) {
    try {
      const performancesRef = db.collection(this.parentCollection)
        .doc(productionId)
        .collection(this.subcollection);
      
      const snapshot = await performancesRef.get();
      const performances = docsToObjects(snapshot.docs);
      
      // Filter by search term (case insensitive)
      const filteredPerformances = performances.filter(performance => 
        performance.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        performance.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        performance.venueName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredPerformances, pagination.limit, pagination.offset);
      }
      
      return filteredPerformances;
    } catch (error) {
      throw new Error(`Failed to search performances: ${error.message}`);
    }
  }

  // Get all performances across all productions (admin function)
  async getAllPerformancesAcrossProductions(filters = {}, pagination = {}) {
    try {
      const productionsRef = db.collection(this.parentCollection);
      const productionsSnapshot = await productionsRef.get();
      
      let allPerformances = [];
      
      for (const productionDoc of productionsSnapshot.docs) {
        const performancesRef = productionDoc.ref.collection(this.subcollection);
        const performancesSnapshot = await performancesRef.get();
        const performances = docsToObjects(performancesSnapshot.docs);
        
        // Add production info to each performance
        const performancesWithProduction = performances.map(performance => ({
          ...performance,
          productionId: productionDoc.id,
          productionTitle: productionDoc.data().title
        }));
        
        allPerformances = allPerformances.concat(performancesWithProduction);
      }
      
      // Apply filters
      if (filters.status) {
        allPerformances = allPerformances.filter(p => p.status === filters.status);
      }
      if (filters.dateFrom) {
        allPerformances = allPerformances.filter(p => new Date(p.date) >= new Date(filters.dateFrom));
      }
      if (filters.dateTo) {
        allPerformances = allPerformances.filter(p => new Date(p.date) <= new Date(filters.dateTo));
      }
      
      // Sort by date
      allPerformances.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(allPerformances, pagination.limit, pagination.offset);
      }
      
      return allPerformances;
    } catch (error) {
      throw new Error(`Failed to get all performances across productions: ${error.message}`);
    }
  }
}

module.exports = new PerformancesController();
