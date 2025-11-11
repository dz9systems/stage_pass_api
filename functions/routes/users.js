const express = require("express");
const router = express.Router();
const { UsersController } = require("../controllers");
const { sendGreetingEmail } = require("../services/email");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new user
router.post("/", async (req, res) => {
  try {
    const {
      displayName,
      email,
      photoURL,
      role = 'customer',
      phone,
      address,
      city,
      state,
      zipCode
    } = req.body;

    // Validate required fields
    if (!displayName || !email) {
      return res.status(400).json({ 
        error: "displayName and email are required" 
      });
    }

    // Validate role
    if (!['customer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ 
        error: "role must be either 'customer', 'seller', or 'admin'" 
      });
    }

    const userId = generateId();
    const now = new Date().toISOString();

    const user = {
      id: userId,
      displayName,
      email,
      photoURL: photoURL || null,
      role,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      createdAt: now,
      updatedAt: now
    };

    const createdUser = await UsersController.upsertUser(user);

    // Send welcome email asynchronously (don't block user creation if email fails)
    sendGreetingEmail({
      to: email,
      name: displayName,
      subject: "Welcome to Stage Pass Pro!"
    }).catch((emailError) => {
      // Log email error but don't fail user creation
      
    });

    res.status(201).json({
      success: true,
      user: createdUser
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create user',
      message: error.message 
    });
  }
});

// READ - Get all users
router.get("/", async (req, res) => {
  try {
    const { role, limit = 100, offset = 0 } = req.query;
    
    const result = await UsersController.getAllUsers({ role }, { limit, offset });
    
    // Check if result has pagination (from controller)
    if (result.pagination) {
      res.json({
        success: true,
        users: result.data,
        pagination: result.pagination
      });
    } else {
      // Fallback for when pagination is not applied
      res.json({
        success: true,
        users: result,
        pagination: {
          total: result.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: false
        }
      });
    }

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve users',
      message: error.message 
    });
  }
});

// READ - Get user by ID
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await UsersController.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve user',
      message: error.message 
    });
  }
});

// UPDATE - Update user by ID
router.put("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      displayName,
      email,
      photoURL,
      role,
      phone,
      address,
      city,
      state,
      zipCode
    } = req.body;

    // Check if user exists
    const existingUser = await UsersController.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Validate role if provided
    if (role && !['customer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ 
        error: "role must be either 'customer', 'seller', or 'admin'" 
      });
    }

    // Update only provided fields
    const updatedUser = {
      ...existingUser,
      ...(displayName !== undefined && { displayName }),
      ...(email !== undefined && { email }),
      ...(photoURL !== undefined && { photoURL }),
      ...(role !== undefined && { role }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(state !== undefined && { state }),
      ...(zipCode !== undefined && { zipCode }),
      updatedAt: new Date().toISOString()
    };

    const result = await UsersController.upsertUser(updatedUser);

    res.json({
      success: true,
      user: result
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update user',
      message: error.message 
    });
  }
});

// PATCH - Partially update user by ID
router.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Check if user exists
    const existingUser = await UsersController.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Validate role if provided
    if (updates.role && !['customer', 'seller', 'admin'].includes(updates.role)) {
      return res.status(400).json({ 
        error: "role must be either 'customer', 'seller', or 'admin'" 
      });
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedUser = {
      ...existingUser,
      ...cleanUpdates
    };

    const result = await UsersController.upsertUser(updatedUser);

    res.json({
      success: true,
      user: result
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update user',
      message: error.message 
    });
  }
});

// DELETE - Delete user by ID
router.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const existingUser = await UsersController.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    await UsersController.deleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete user',
      message: error.message 
    });
  }
});

module.exports = router;
