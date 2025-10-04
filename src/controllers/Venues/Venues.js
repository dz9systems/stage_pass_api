const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class VenuesController {
  constructor() {
    this.collection = 'venues';
  }

  // Create or update a venue
  async upsertVenue(venue) {
    try {
      const venueData = addTimestamps(venue, !!venue.id);
      const venueRef = db.collection(this.collection).doc(venue.id);
      await venueRef.set(venueData, { merge: true });
      return venueData;
    } catch (error) {
      throw new Error(`Failed to upsert venue: ${error.message}`);
    }
  }

  // Get venue by ID
  async getVenueById(venueId) {
    try {
      const venueDoc = await db.collection(this.collection).doc(venueId).get();
      return docToObject(venueDoc);
    } catch (error) {
      throw new Error(`Failed to get venue by ID: ${error.message}`);
    }
  }

  // Get all venues with optional filtering and pagination
  async getAllVenues(filters = {}, pagination = {}) {
    try {
      const venuesRef = db.collection(this.collection);
      const query = buildQuery(venuesRef, filters);
      const snapshot = await query.get();
      const venues = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(venues, pagination.limit, pagination.offset);
      }
      
      return venues;
    } catch (error) {
      throw new Error(`Failed to get all venues: ${error.message}`);
    }
  }

  // Get venues by seller ID
  async getVenuesBySellerId(sellerId, filters = {}, pagination = {}) {
    try {
      const venuesRef = db.collection(this.collection);
      const query = venuesRef.where('sellerId', '==', sellerId);
      
      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'city') {
            query.where('city', '==', value);
          } else if (key === 'state') {
            query.where('state', '==', value);
          } else if (key === 'minCapacity') {
            query.where('capacity', '>=', parseInt(value));
          } else if (key === 'maxCapacity') {
            query.where('capacity', '<=', parseInt(value));
          }
        }
      });
      
      const snapshot = await query.get();
      const venues = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(venues, pagination.limit, pagination.offset);
      }
      
      return venues;
    } catch (error) {
      throw new Error(`Failed to get venues by seller ID: ${error.message}`);
    }
  }

  // Get venues by city
  async getVenuesByCity(city, pagination = {}) {
    try {
      return await this.getAllVenues({ city }, pagination);
    } catch (error) {
      throw new Error(`Failed to get venues by city: ${error.message}`);
    }
  }

  // Get venues by state
  async getVenuesByState(state, pagination = {}) {
    try {
      return await this.getAllVenues({ state }, pagination);
    } catch (error) {
      throw new Error(`Failed to get venues by state: ${error.message}`);
    }
  }

  // Get venues by capacity range
  async getVenuesByCapacityRange(minCapacity, maxCapacity, pagination = {}) {
    try {
      return await this.getAllVenues({ minCapacity, maxCapacity }, pagination);
    } catch (error) {
      throw new Error(`Failed to get venues by capacity range: ${error.message}`);
    }
  }

  // Search venues by name or address
  async searchVenues(searchTerm, pagination = {}) {
    try {
      const venuesRef = db.collection(this.collection);
      const snapshot = await venuesRef.get();
      const venues = docsToObjects(snapshot.docs);
      
      // Filter by search term (case insensitive)
      const filteredVenues = venues.filter(venue => 
        venue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venue.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venue.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venue.state?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredVenues, pagination.limit, pagination.offset);
      }
      
      return filteredVenues;
    } catch (error) {
      throw new Error(`Failed to search venues: ${error.message}`);
    }
  }

  // Update venue
  async updateVenue(venueId, updateData) {
    try {
      const venueRef = db.collection(this.collection).doc(venueId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await venueRef.update(updateDataWithTimestamp);
      return { id: venueId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update venue: ${error.message}`);
    }
  }

  // Delete venue
  async deleteVenue(venueId) {
    try {
      await db.collection(this.collection).doc(venueId).delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete venue: ${error.message}`);
    }
  }

  // Get venue statistics
  async getVenueStats(sellerId = null) {
    try {
      const venuesRef = db.collection(this.collection);
      let query = venuesRef;
      
      if (sellerId) {
        query = query.where('sellerId', '==', sellerId);
      }
      
      const snapshot = await query.get();
      const venues = docsToObjects(snapshot.docs);
      
      const stats = {
        total: venues.length,
        totalCapacity: venues.reduce((sum, v) => sum + (v.capacity || 0), 0),
        averageCapacity: venues.reduce((sum, v) => sum + (v.capacity || 0), 0) / venues.length || 0,
        cities: [...new Set(venues.map(v => v.city).filter(Boolean))],
        states: [...new Set(venues.map(v => v.state).filter(Boolean))],
        largestVenue: venues.reduce((max, v) => (v.capacity || 0) > (max.capacity || 0) ? v : max, { capacity: 0 }),
        smallestVenue: venues.reduce((min, v) => (v.capacity || 0) < (min.capacity || 0) ? v : min, { capacity: Infinity })
      };
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get venue stats: ${error.message}`);
    }
  }

  // Get venues near a location (basic implementation)
  async getVenuesNearLocation(latitude, longitude, radiusKm = 50, pagination = {}) {
    try {
      // Note: This is a basic implementation. For production, consider using GeoFirestore
      const venuesRef = db.collection(this.collection);
      const snapshot = await venuesRef.get();
      const venues = docsToObjects(snapshot.docs);
      
      // Filter venues that have coordinates
      const venuesWithCoords = venues.filter(venue => venue.latitude && venue.longitude);
      
      // Calculate distance and filter by radius
      const nearbyVenues = venuesWithCoords.filter(venue => {
        const distance = this.calculateDistance(
          latitude, longitude,
          venue.latitude, venue.longitude
        );
        return distance <= radiusKm;
      });
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(nearbyVenues, pagination.limit, pagination.offset);
      }
      
      return nearbyVenues;
    } catch (error) {
      throw new Error(`Failed to get venues near location: ${error.message}`);
    }
  }

  // Helper function to calculate distance between two coordinates
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in kilometers
    return d;
  }

  // Helper function to convert degrees to radians
  deg2rad(deg) {
    return deg * (Math.PI/180);
  }
}

module.exports = new VenuesController();
