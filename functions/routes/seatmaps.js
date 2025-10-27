const express = require("express");
const router = express.Router();
const { SeatmapsController, VenuesController } = require("../controllers");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new seatmap for a venue
router.post("/:venueId/seatmaps", async (req, res) => {
  try {
    const { venueId } = req.params;
    const {
      name,
      layout,
      sections = [],
      rows = [],
      seats = []
    } = req.body;

    // Validate required fields
    if (!name || !layout) {
      return res.status(400).json({
        error: "name and layout are required"
      });
    }

    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    const seatmapId = generateId();
    const now = new Date().toISOString();

    const seatmap = {
      id: seatmapId,
      name,
      layout,
      sections,
      rows,
      seats,
      createdAt: now,
      updatedAt: now
    };

    const createdSeatmap = await SeatmapsController.upsertSeatmap(venueId, seatmap);

    res.status(201).json({
      success: true,
      seatmap: createdSeatmap
    });

  } catch (error) {
    console.error('Seatmap creation error:', error);
    res.status(500).json({
      error: 'Failed to create seatmap',
      message: error.message
    });
  }
});

// READ - Get all seatmaps for a venue
router.get("/:venueId/seatmaps", async (req, res) => {
  try {
    const { venueId } = req.params;
    const {
      name,
      limit = 100,
      offset = 0
    } = req.query;

    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    const seatmaps = await SeatmapsController.getAllSeatmaps(venueId, { name });

    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedSeatmaps = seatmaps.slice(startIndex, endIndex);

    res.json({
      success: true,
      venueId,
      seatmaps: paginatedSeatmaps,
      pagination: {
        total: seatmaps.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < seatmaps.length
      }
    });

  } catch (error) {
    console.error('Seatmaps retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve seatmaps',
      message: error.message
    });
  }
});

// READ - Get seatmap by ID
router.get("/:venueId/seatmaps/:seatmapId", async (req, res) => {
  try {
    const { venueId, seatmapId } = req.params;

    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    const seatmap = await SeatmapsController.getSeatmapById(venueId, seatmapId);

    if (!seatmap) {
      return res.status(404).json({
        error: 'Seatmap not found'
      });
    }

    res.json({
      success: true,
      seatmap
    });

  } catch (error) {
    console.error('Seatmap retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve seatmap',
      message: error.message
    });
  }
});

// UPDATE - Update seatmap by ID
router.put("/:venueId/seatmaps/:seatmapId", async (req, res) => {
  try {
    const { venueId, seatmapId } = req.params;
    const {
      name,
      layout,
      sections,
      rows,
      seats
    } = req.body;
    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    // Check if seatmap exists
    const existingSeatmap = await SeatmapsController.getSeatmapById(venueId, seatmapId);
    if (!existingSeatmap) {
      return res.status(404).json({
        error: 'Seatmap not found'
      });
    }

    // Update only provided fields
    const updatedSeatmap = {
      ...existingSeatmap,
      ...(name !== undefined && { name }),
      ...(layout !== undefined && { layout }),
      ...(sections !== undefined && { sections }),
      ...(rows !== undefined && { rows }),
      ...(seats !== undefined && { seats }),
      updatedAt: new Date().toISOString()
    };

    const result = await SeatmapsController.upsertSeatmap(venueId, updatedSeatmap);

    res.json({
      success: true,
      seatmap: result
    });

  } catch (error) {
    console.error('Seatmap update error:', error);
    res.status(500).json({
      error: 'Failed to update seatmap',
      message: error.message
    });
  }
});

// PATCH - Partially update seatmap by ID
router.patch("/:venueId/seatmaps/:seatmapId", async (req, res) => {
  try {
    const { venueId, seatmapId } = req.params;
    const updates = req.body;

    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    // Check if seatmap exists
    const existingSeatmap = await SeatmapsController.getSeatmapById(venueId, seatmapId);
    if (!existingSeatmap) {
      return res.status(404).json({
        error: 'Seatmap not found'
      });
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedSeatmap = {
      ...existingSeatmap,
      ...cleanUpdates
    };

    const result = await SeatmapsController.upsertSeatmap(venueId, updatedSeatmap);

    res.json({
      success: true,
      seatmap: result
    });

  } catch (error) {
    console.error('Seatmap patch error:', error);
    res.status(500).json({
      error: 'Failed to update seatmap',
      message: error.message
    });
  }
});

// DELETE - Delete seatmap by ID
router.delete("/:venueId/seatmaps/:seatmapId", async (req, res) => {
  try {
    const { venueId, seatmapId } = req.params;

    // Check if venue exists
    const venue = await VenuesController.getVenueById(venueId);
    if (!venue) {
      return res.status(404).json({
        error: 'Venue not found'
      });
    }

    // Check if seatmap exists
    const existingSeatmap = await SeatmapsController.getSeatmapById(venueId, seatmapId);
    if (!existingSeatmap) {
      return res.status(404).json({
        error: 'Seatmap not found'
      });
    }

    await SeatmapsController.deleteSeatmap(venueId, seatmapId);

    res.json({
      success: true,
      message: 'Seatmap deleted successfully'
    });

  } catch (error) {
    console.error('Seatmap deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete seatmap',
      message: error.message
    });
  }
});

module.exports = router;
