const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class SeatmapsController {
  constructor() {
    this.parentCollection = 'venues';
    this.subcollection = 'seatmaps';
  }

  // Create or update a seatmap
  async upsertSeatmap(venueId, seatmap) {
    try {
      const seatmapData = addTimestamps(seatmap, !!seatmap.id);
      const seatmapRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection)
        .doc(seatmap.id);
      await seatmapRef.set(seatmapData, { merge: true });
      return seatmapData;
    } catch (error) {
      throw new Error(`Failed to upsert seatmap: ${error.message}`);
    }
  }

  // Get seatmap by ID
  async getSeatmapById(venueId, seatmapId) {
    try {
      const seatmapDoc = await db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection)
        .doc(seatmapId)
        .get();
      return docToObject(seatmapDoc);
    } catch (error) {
      throw new Error(`Failed to get seatmap by ID: ${error.message}`);
    }
  }

  // Get all seatmaps for a venue
  async getAllSeatmaps(venueId, filters = {}, pagination = {}) {
    try {
      const seatmapsRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection);

      let query = seatmapsRef;

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'name') {
            query = query.where('name', '==', value);
          } else if (key === 'type') {
            query = query.where('type', '==', value);
          } else if (key === 'status') {
            query = query.where('status', '==', value);
          }
        }
      });

      const snapshot = await query.get();
      const seatmaps = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(seatmaps, pagination.limit, pagination.offset);
      }

      return seatmaps;
    } catch (error) {
      throw new Error(`Failed to get all seatmaps: ${error.message}`);
    }
  }

  // Get seatmaps by type
  async getSeatmapsByType(venueId, type, pagination = {}) {
    try {
      return await this.getAllSeatmaps(venueId, { type }, pagination);
    } catch (error) {
      throw new Error(`Failed to get seatmaps by type: ${error.message}`);
    }
  }

  // Get active seatmaps
  async getActiveSeatmaps(venueId, pagination = {}) {
    try {
      return await this.getAllSeatmaps(venueId, { status: 'active' }, pagination);
    } catch (error) {
      throw new Error(`Failed to get active seatmaps: ${error.message}`);
    }
  }

  // Search seatmaps by name
  async searchSeatmaps(venueId, searchTerm, pagination = {}) {
    try {
      const seatmapsRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection);

      const snapshot = await seatmapsRef.get();
      const seatmaps = docsToObjects(snapshot.docs);

      // Filter by search term (case insensitive)
      const filteredSeatmaps = seatmaps.filter(seatmap =>
        seatmap.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seatmap.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredSeatmaps, pagination.limit, pagination.offset);
      }

      return filteredSeatmaps;
    } catch (error) {
      throw new Error(`Failed to search seatmaps: ${error.message}`);
    }
  }

  // Update seatmap
  async updateSeatmap(venueId, seatmapId, updateData) {
    try {
      const seatmapRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection)
        .doc(seatmapId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await seatmapRef.update(updateDataWithTimestamp);
      return { id: seatmapId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update seatmap: ${error.message}`);
    }
  }

  // Update seatmap status
  async updateSeatmapStatus(venueId, seatmapId, status) {
    try {
      return await this.updateSeatmap(venueId, seatmapId, { status });
    } catch (error) {
      throw new Error(`Failed to update seatmap status: ${error.message}`);
    }
  }

  // Activate seatmap
  async activateSeatmap(venueId, seatmapId) {
    try {
      return await this.updateSeatmapStatus(venueId, seatmapId, 'active');
    } catch (error) {
      throw new Error(`Failed to activate seatmap: ${error.message}`);
    }
  }

  // Deactivate seatmap
  async deactivateSeatmap(venueId, seatmapId) {
    try {
      return await this.updateSeatmapStatus(venueId, seatmapId, 'inactive');
    } catch (error) {
      throw new Error(`Failed to deactivate seatmap: ${error.message}`);
    }
  }

  // Delete seatmap
  async deleteSeatmap(venueId, seatmapId) {
    try {
      await db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection)
        .doc(seatmapId)
        .delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete seatmap: ${error.message}`);
    }
  }

  // Get seatmap statistics
  async getSeatmapStats(venueId) {
    try {
      const seatmapsRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection);

      const snapshot = await seatmapsRef.get();
      const seatmaps = docsToObjects(snapshot.docs);

      const stats = {
        total: seatmaps.length,
        active: seatmaps.filter(s => s.status === 'active').length,
        inactive: seatmaps.filter(s => s.status === 'inactive').length,
        draft: seatmaps.filter(s => s.status === 'draft').length,
        totalCapacity: seatmaps.reduce((sum, s) => sum + (s.totalCapacity || 0), 0),
        averageCapacity: seatmaps.length > 0
          ? seatmaps.reduce((sum, s) => sum + (s.totalCapacity || 0), 0) / seatmaps.length
          : 0,
        types: [...new Set(seatmaps.map(s => s.type).filter(Boolean))],
        sections: seatmaps.reduce((total, s) => total + (s.sections?.length || 0), 0)
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get seatmap stats: ${error.message}`);
    }
  }

  // Get seatmap by section
  async getSeatmapBySection(venueId, sectionName) {
    try {
      const seatmapsRef = db.collection(this.parentCollection)
        .doc(venueId)
        .collection(this.subcollection);

      const snapshot = await seatmapsRef.get();
      const seatmaps = docsToObjects(snapshot.docs);

      // Find seatmap that contains the section
      const seatmap = seatmaps.find(s =>
        s.sections?.some(section => section.name === sectionName)
      );

      return seatmap;
    } catch (error) {
      throw new Error(`Failed to get seatmap by section: ${error.message}`);
    }
  }

  // Get seatmap capacity by section
  async getSeatmapCapacityBySection(venueId, sectionName) {
    try {
      const seatmap = await this.getSeatmapBySection(venueId, sectionName);

      if (!seatmap || !seatmap.sections) {
        return { capacity: 0, available: 0, occupied: 0 };
      }

      const section = seatmap.sections.find(s => s.name === sectionName);
      if (!section) {
        return { capacity: 0, available: 0, occupied: 0 };
      }

      return {
        capacity: section.capacity || 0,
        available: section.available || section.capacity || 0,
        occupied: (section.capacity || 0) - (section.available || 0)
      };
    } catch (error) {
      throw new Error(`Failed to get seatmap capacity by section: ${error.message}`);
    }
  }

  // Update seat availability
  async updateSeatAvailability(venueId, seatmapId, sectionName, seatNumber, isAvailable) {
    try {
      const seatmap = await this.getSeatmapById(venueId, seatmapId);

      if (!seatmap || !seatmap.sections) {
        throw new Error('Seatmap or sections not found');
      }

      const sectionIndex = seatmap.sections.findIndex(s => s.name === sectionName);
      if (sectionIndex === -1) {
        throw new Error('Section not found');
      }

      // Update the seat availability
      const updatedSections = [...seatmap.sections];
      if (!updatedSections[sectionIndex].seats) {
        updatedSections[sectionIndex].seats = {};
      }

      updatedSections[sectionIndex].seats[seatNumber] = {
        ...updatedSections[sectionIndex].seats[seatNumber],
        available: isAvailable,
        updatedAt: new Date()
      };

      // Recalculate section availability
      const totalSeats = Object.keys(updatedSections[sectionIndex].seats).length;
      const availableSeats = Object.values(updatedSections[sectionIndex].seats)
        .filter(seat => seat.available).length;

      updatedSections[sectionIndex].available = availableSeats;
      updatedSections[sectionIndex].capacity = totalSeats;

      // Update the seatmap
      return await this.updateSeatmap(venueId, seatmapId, { sections: updatedSections });
    } catch (error) {
      throw new Error(`Failed to update seat availability: ${error.message}`);
    }
  }

  // Get all seatmaps across all venues (admin function)
  async getAllSeatmapsAcrossVenues(filters = {}, pagination = {}) {
    try {
      const venuesRef = db.collection(this.parentCollection);
      const venuesSnapshot = await venuesRef.get();

      let allSeatmaps = [];

      for (const venueDoc of venuesSnapshot.docs) {
        const seatmapsRef = venueDoc.ref.collection(this.subcollection);
        const seatmapsSnapshot = await seatmapsRef.get();
        const seatmaps = docsToObjects(seatmapsSnapshot.docs);

        // Add venue info to each seatmap
        const seatmapsWithVenue = seatmaps.map(seatmap => ({
          ...seatmap,
          venueId: venueDoc.id,
          venueName: venueDoc.data().name
        }));

        allSeatmaps = allSeatmaps.concat(seatmapsWithVenue);
      }

      // Apply filters
      if (filters.status) {
        allSeatmaps = allSeatmaps.filter(s => s.status === filters.status);
      }
      if (filters.type) {
        allSeatmaps = allSeatmaps.filter(s => s.type === filters.type);
      }

      if (pagination.limit || pagination.offset) {
        return applyPagination(allSeatmaps, pagination.limit, pagination.offset);
      }

      return allSeatmaps;
    } catch (error) {
      throw new Error(`Failed to get all seatmaps across venues: ${error.message}`);
    }
  }
}

module.exports = new SeatmapsController();
