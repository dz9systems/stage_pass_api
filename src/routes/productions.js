const express = require("express");
const router = express.Router();
const { ProductionsController } = require("../controllers");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new production
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      shortDescription,
      imageURL,
      sellerId,
      venue,
      duration,
      categories = [],
      status = 'active',
      startDate,
      endDate,
      director
    } = req.body;

    // Validate required fields
    if (!title || !description || !sellerId) {
      return res.status(400).json({
        error: "title, description, and sellerId are required"
      });
    }

    // Validate status
    if (!['active', 'upcoming', 'past', 'draft'].includes(status)) {
      return res.status(400).json({
        error: "status must be one of: 'active', 'upcoming', 'past', 'draft'"
      });
    }

    const productionId = generateId();
    const now = new Date().toISOString();

    const production = {
      id: productionId,
      title,
      description,
      shortDescription: shortDescription || description.substring(0, 150) + '...',
      imageURL: imageURL || null,
      sellerId,
      venue: venue || null,
      duration: duration || null,
      categories,
      status,
      startDate: startDate || null,
      endDate: endDate || null,
      director: director || null,
      createdAt: now,
      updatedAt: now,
      performances: {} // Initialize empty performances subcollection
    };

    const createdProduction = await ProductionsController.upsertProduction(production);

    res.status(201).json({
      success: true,
      production: createdProduction
    });

  } catch (error) {
    console.error('Production creation error:', error);
    res.status(500).json({
      error: 'Failed to create production',
      message: error.message
    });
  }
});

// READ - Get all productions
router.get("/", async (req, res) => {
  try {
    const {
      sellerId,
      status,
      category,
      limit = 100,
      offset = 0
    } = req.query;

    const productions = await ProductionsController.getAllProductions({ sellerId, status, category });
   
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProductions = productions.slice(startIndex, endIndex);

    res.json({
      success: true,
      productions: paginatedProductions,
      pagination: {
        total: productions.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < productions.length
      }
    });

  } catch (error) {
    console.error('Productions retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve productions',
      message: error.message
    });
  }
});

// READ - Get production by ID
router.get("/:productionId", async (req, res) => {
  try {
    const { productionId } = req.params;

    const production = await ProductionsController.getProductionById(productionId);

    if (!production) {
      return res.status(404).json({
        error: 'Production not found'
      });
    }

    res.json({
      success: true,
      production
    });

  } catch (error) {
    console.error('Production retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve production',
      message: error.message
    });
  }
});

// READ - Get productions by seller ID
router.get("/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { status, limit = 100, offset = 0 } = req.query;

    const productions = await ProductionsController.getProductionsBySellerId(sellerId, { status });

    console.log('Total productions found for seller:', productions);

    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProductions = productions.slice(startIndex, endIndex);

    res.json({
      success: true,
      productions: paginatedProductions,
      pagination: {
        total: productions.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < productions.length
      }
    });

  } catch (error) {
    console.error('Seller productions retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve seller productions',
      message: error.message
    });
  }
});

// UPDATE - Update production by ID
router.put("/:productionId", async (req, res) => {
  try {
    const { productionId } = req.params;
    const {
      title,
      description,
      shortDescription,
      imageURL,
      sellerId,
      venue,
      duration,
      categories,
      status,
      startDate,
      endDate,
      director
    } = req.body;

    // Check if production exists
    const existingProduction = await ProductionsController.getProductionById(productionId);
    if (!existingProduction) {
      return res.status(404).json({
        error: 'Production not found'
      });
    }

    // Validate status if provided
    if (status && !['active', 'upcoming', 'past', 'draft'].includes(status)) {
      return res.status(400).json({
        error: "status must be one of: 'active', 'upcoming', 'past', 'draft'"
      });
    }

    // Update only provided fields
    const updatedProduction = {
      ...existingProduction,
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(shortDescription !== undefined && { shortDescription }),
      ...(imageURL !== undefined && { imageURL }),
      ...(sellerId !== undefined && { sellerId }),
      ...(venue !== undefined && { venue }),
      ...(duration !== undefined && { duration }),
      ...(categories !== undefined && { categories }),
      ...(status !== undefined && { status }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      ...(director !== undefined && { director }),
      updatedAt: new Date().toISOString()
    };

    const result = await ProductionsController.upsertProduction(updatedProduction);

    res.json({
      success: true,
      production: result
    });

  } catch (error) {
    console.error('Production update error:', error);
    res.status(500).json({
      error: 'Failed to update production',
      message: error.message
    });
  }
});

// PATCH - Partially update production by ID
router.patch("/:productionId", async (req, res) => {
  try {
    const { productionId } = req.params;
    const updates = req.body;

    // Check if production exists
    const existingProduction = await ProductionsController.getProductionById(productionId);
    if (!existingProduction) {
      return res.status(404).json({
        error: 'Production not found'
      });
    }

    // Validate status if provided
    if (updates.status && !['active', 'upcoming', 'past', 'draft'].includes(updates.status)) {
      return res.status(400).json({
        error: "status must be one of: 'active', 'upcoming', 'past', 'draft'"
      });
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedProduction = {
      ...existingProduction,
      ...cleanUpdates
    };

    const result = await ProductionsController.upsertProduction(updatedProduction);

    res.json({
      success: true,
      production: result
    });

  } catch (error) {
    console.error('Production patch error:', error);
    res.status(500).json({
      error: 'Failed to update production',
      message: error.message
    });
  }
});

// DELETE - Delete production by ID
router.delete("/:productionId", async (req, res) => {
  try {
    const { productionId } = req.params;

    // Check if production exists
    const existingProduction = await ProductionsController.getProductionById(productionId);
    if (!existingProduction) {
      return res.status(404).json({
        error: 'Production not found'
      });
    }

    await ProductionsController.deleteProduction(productionId);

    res.json({
      success: true,
      message: 'Production deleted successfully'
    });

  } catch (error) {
    console.error('Production deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete production',
      message: error.message
    });
  }
});

module.exports = router;
