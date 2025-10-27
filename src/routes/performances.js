const express = require("express");
const router = express.Router();
const { PerformancesController, ProductionsController } = require("../controllers");

// READ - Get all performances across all productions (for performances page)
router.get("/", async (req, res) => {
  try {
    const { 
      status, 
      dateFrom, 
      dateTo,
      productionId,
      venueId,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const filters = { status, dateFrom, dateTo, venueId };
    const pagination = { limit: parseInt(limit), offset: parseInt(offset) };
    
    const result = await PerformancesController.getAllPerformancesAcrossProductions(filters, pagination);
    
    // Handle both paginated and non-paginated responses
    const performances = result.data || result;
    const paginationInfo = result.pagination || {
      total: performances.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: performances.length === parseInt(limit)
    };
    
    res.json({
      success: true,
      performances,
      pagination: paginationInfo
    });

  } catch (error) {
    console.error('All performances retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve performances',
      message: error.message 
    });
  }
});

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new performance for a production
router.post("/:productionId/performances", async (req, res) => {
  try {
    const { productionId } = req.params;
    const {
      date,
      sellerId,
      venueId,
      seatmapId,
      status = 'scheduled',
      totalSeats,
      soldSeats = 0,
      priceCategories = []
    } = req.body;

    // Validate required fields
    if (!date || !sellerId || !venueId) {
      return res.status(400).json({ 
        error: "date, sellerId, and venueId are required" 
      });
    }

    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }

    // Validate status
    if (!['scheduled', 'canceled', 'sold-out', 'completed'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'scheduled', 'canceled', 'sold-out', 'completed'" 
      });
    }

    const performanceId = generateId();
    const now = new Date().toISOString();

    const performance = {
      id: performanceId,
      date: new Date(date).toISOString(),
      productionId,
      sellerId,
      venueId,
      seatmapId: seatmapId || null,
      status,
      totalSeats: totalSeats || 0,
      soldSeats,
      priceCategories,
      createdAt: now,
      updatedAt: now
    };

    const createdPerformance = await PerformancesController.upsertPerformance(productionId, performance);

    res.status(201).json({
      success: true,
      performance: createdPerformance
    });

  } catch (error) {
    console.error('Performance creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create performance',
      message: error.message 
    });
  }
});

// READ - Get all performances for a production
router.get("/:productionId/performances", async (req, res) => {
  try {
    const { productionId } = req.params;
    const { 
      status, 
      dateFrom, 
      dateTo,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }
    
    const performances = await PerformancesController.getAllPerformances(productionId, { status, dateFrom, dateTo });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPerformances = performances.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      productionId,
      performances: paginatedPerformances,
      pagination: {
        total: performances.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < performances.length
      }
    });

  } catch (error) {
    console.error('Performances retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve performances',
      message: error.message 
    });
  }
});

// READ - Get performance by ID
router.get("/:productionId/performances/:performanceId", async (req, res) => {
  try {
    const { productionId, performanceId } = req.params;
    
    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }
    
    const performance = await PerformancesController.getPerformanceById(productionId, performanceId);
    
    if (!performance) {
      return res.status(404).json({ 
        error: 'Performance not found' 
      });
    }

    res.json({
      success: true,
      performance
    });

  } catch (error) {
    console.error('Performance retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve performance',
      message: error.message 
    });
  }
});

// UPDATE - Update performance by ID
router.put("/:productionId/performances/:performanceId", async (req, res) => {
  try {
    const { productionId, performanceId } = req.params;
    const {
      date,
      sellerId,
      venueId,
      seatmapId,
      status,
      totalSeats,
      soldSeats,
      priceCategories
    } = req.body;

    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }

    // Check if performance exists
    const existingPerformance = await PerformancesController.getPerformanceById(productionId, performanceId);
    if (!existingPerformance) {
      return res.status(404).json({ 
        error: 'Performance not found' 
      });
    }

    // Validate status if provided
    if (status && !['scheduled', 'canceled', 'sold-out', 'completed'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'scheduled', 'canceled', 'sold-out', 'completed'" 
      });
    }

    // Update only provided fields
    const updatedPerformance = {
      ...existingPerformance,
      ...(date !== undefined && { date: new Date(date).toISOString() }),
      ...(sellerId !== undefined && { sellerId }),
      ...(venueId !== undefined && { venueId }),
      ...(seatmapId !== undefined && { seatmapId }),
      ...(status !== undefined && { status }),
      ...(totalSeats !== undefined && { totalSeats }),
      ...(soldSeats !== undefined && { soldSeats }),
      ...(priceCategories !== undefined && { priceCategories }),
      updatedAt: new Date().toISOString()
    };

    const result = await PerformancesController.upsertPerformance(productionId, updatedPerformance);

    res.json({
      success: true,
      performance: result
    });

  } catch (error) {
    console.error('Performance update error:', error);
    res.status(500).json({ 
      error: 'Failed to update performance',
      message: error.message 
    });
  }
});

// PATCH - Partially update performance by ID
router.patch("/:productionId/performances/:performanceId", async (req, res) => {
  try {
    const { productionId, performanceId } = req.params;
    const updates = req.body;

    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }

    // Check if performance exists
    const existingPerformance = await PerformancesController.getPerformanceById(productionId, performanceId);
    if (!existingPerformance) {
      return res.status(404).json({ 
        error: 'Performance not found' 
      });
    }

    // Validate status if provided
    if (updates.status && !['scheduled', 'canceled', 'sold-out', 'completed'].includes(updates.status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'scheduled', 'canceled', 'sold-out', 'completed'" 
      });
    }

    // Handle date conversion if provided
    if (updates.date) {
      updates.date = new Date(updates.date).toISOString();
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedPerformance = {
      ...existingPerformance,
      ...cleanUpdates
    };

    const result = await PerformancesController.upsertPerformance(productionId, updatedPerformance);

    res.json({
      success: true,
      performance: result
    });

  } catch (error) {
    console.error('Performance patch error:', error);
    res.status(500).json({ 
      error: 'Failed to update performance',
      message: error.message 
    });
  }
});

// DELETE - Delete performance by ID
router.delete("/:productionId/performances/:performanceId", async (req, res) => {
  try {
    const { productionId, performanceId } = req.params;
    
    // Check if production exists
    const production = await ProductionsController.getProductionById(productionId);
    if (!production) {
      return res.status(404).json({ 
        error: 'Production not found' 
      });
    }

    // Check if performance exists
    const existingPerformance = await PerformancesController.getPerformanceById(productionId, performanceId);
    if (!existingPerformance) {
      return res.status(404).json({ 
        error: 'Performance not found' 
      });
    }

    await PerformancesController.deletePerformance(productionId, performanceId);

    res.json({
      success: true,
      message: 'Performance deleted successfully'
    });

  } catch (error) {
    console.error('Performance deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete performance',
      message: error.message 
    });
  }
});

module.exports = router;
