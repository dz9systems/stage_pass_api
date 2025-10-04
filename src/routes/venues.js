const express = require("express");
const router = express.Router();
const { VenuesController } = require("../controllers");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new venue
router.post("/", async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zipCode,
      capacity,
      imageURL,
      sellerId
    } = req.body;

    // Validate required fields
    if (!name || !address || !city || !state || !sellerId) {
      return res.status(400).json({ 
        error: "name, address, city, state, and sellerId are required" 
      });
    }

    const venueId = generateId();
    const now = new Date().toISOString();

    const venue = {
      id: venueId,
      name,
      address,
      city,
      state,
      zipCode: zipCode || null,
      capacity: capacity || 0,
      imageURL: imageURL || null,
      sellerId,
      createdAt: now,
      updatedAt: now,
      seatmaps: {} // Initialize empty seatmaps subcollection
    };

    const createdVenue = await VenuesController.upsertVenue(venue);

    res.status(201).json({
      success: true,
      venue: createdVenue
    });

  } catch (error) {
    console.error('Venue creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create venue',
      message: error.message 
    });
  }
});

// READ - Get all venues
router.get("/", async (req, res) => {
  try {
    const { 
      sellerId, 
      city,
      state,
      minCapacity,
      maxCapacity,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const venues = await VenuesController.getAllVenues({ sellerId, city, state, minCapacity, maxCapacity });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedVenues = venues.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      venues: paginatedVenues,
      pagination: {
        total: venues.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < venues.length
      }
    });

  } catch (error) {
    console.error('Venues retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve venues',
      message: error.message 
    });
  }
});

// READ - Get venue by ID
router.get("/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    
    const venue = await VenuesController.getVenueById(venueId);
    
    if (!venue) {
      return res.status(404).json({ 
        error: 'Venue not found' 
      });
    }

    res.json({
      success: true,
      venue
    });

  } catch (error) {
    console.error('Venue retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve venue',
      message: error.message 
    });
  }
});

// READ - Get venues by seller ID
router.get("/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { 
      city,
      state,
      minCapacity,
      maxCapacity,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const venues = await VenuesController.getVenuesBySellerId(sellerId, { city, state, minCapacity, maxCapacity });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedVenues = venues.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      venues: paginatedVenues,
      pagination: {
        total: venues.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < venues.length
      }
    });

  } catch (error) {
    console.error('Seller venues retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve seller venues',
      message: error.message 
    });
  }
});

// UPDATE - Update venue by ID
router.put("/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    const {
      name,
      address,
      city,
      state,
      zipCode,
      capacity,
      imageURL,
      sellerId
    } = req.body;

    // Check if venue exists
    const existingVenue = await VenuesController.getVenueById(venueId);
    if (!existingVenue) {
      return res.status(404).json({ 
        error: 'Venue not found' 
      });
    }

    // Update only provided fields
    const updatedVenue = {
      ...existingVenue,
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(state !== undefined && { state }),
      ...(zipCode !== undefined && { zipCode }),
      ...(capacity !== undefined && { capacity }),
      ...(imageURL !== undefined && { imageURL }),
      ...(sellerId !== undefined && { sellerId }),
      updatedAt: new Date().toISOString()
    };

    const result = await VenuesController.upsertVenue(updatedVenue);

    res.json({
      success: true,
      venue: result
    });

  } catch (error) {
    console.error('Venue update error:', error);
    res.status(500).json({ 
      error: 'Failed to update venue',
      message: error.message 
    });
  }
});

// PATCH - Partially update venue by ID
router.patch("/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    const updates = req.body;

    // Check if venue exists
    const existingVenue = await VenuesController.getVenueById(venueId);
    if (!existingVenue) {
      return res.status(404).json({ 
        error: 'Venue not found' 
      });
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedVenue = {
      ...existingVenue,
      ...cleanUpdates
    };

    const result = await VenuesController.upsertVenue(updatedVenue);

    res.json({
      success: true,
      venue: result
    });

  } catch (error) {
    console.error('Venue patch error:', error);
    res.status(500).json({ 
      error: 'Failed to update venue',
      message: error.message 
    });
  }
});

// DELETE - Delete venue by ID
router.delete("/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    
    // Check if venue exists
    const existingVenue = await VenuesController.getVenueById(venueId);
    if (!existingVenue) {
      return res.status(404).json({ 
        error: 'Venue not found' 
      });
    }

    await VenuesController.deleteVenue(venueId);

    res.json({
      success: true,
      message: 'Venue deleted successfully'
    });

  } catch (error) {
    console.error('Venue deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete venue',
      message: error.message 
    });
  }
});

module.exports = router;
