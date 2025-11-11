const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { OrdersController, TicketsController } = require("../controllers");
const { optionalAuth } = require("../middleware/auth");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate secure random token for order viewing (32 bytes, base64 encoded)
function generateViewToken() {
  return crypto.randomBytes(32).toString('base64url'); // base64url is URL-safe
}

// Calculate token expiration (2 years from now)
function calculateTokenExpiration() {
  const twoYearsFromNow = new Date();
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
  return twoYearsFromNow.toISOString();
}

// CREATE - Create a new order
router.post("/", async (req, res) => {
  try {
    const {
      sellerId, // sellerId is the userId (no separate userId needed)
      productionId,
      performanceId,
      totalAmount,
      status = 'pending',
      paymentStatus = 'pending',
      paymentMethod,
      customerEmail, // Customer email (separate from sellerId)
      baseUrl, // Frontend-provided base URL for QR codes (e.g., localhost:5173 in dev, stagepasspro.com in prod)
      // Venue information (sent from frontend)
      venueName,
      venueAddress,
      venueCity,
      venueState,
      venueZipCode,
      // Performance date/time (sent from frontend)
      performanceDate,
      performanceTime,
      // Tickets - can be array of ticket objects OR array of ticket IDs
      tickets = []
    } = req.body;

    // Validate required fields
    if (!sellerId || !productionId || !performanceId || !totalAmount) {
      return res.status(400).json({ 
        error: "sellerId, productionId, performanceId, and totalAmount are required" 
      });
    }

    // Validate sellerId is not an email address
    if (sellerId.includes('@')) {
      return res.status(400).json({ 
        error: "sellerId must be a user ID, not an email address. Use 'customerEmail' field for the customer's email address." 
      });
    }

    // Validate tickets is an array
    if (tickets && !Array.isArray(tickets)) {
      return res.status(400).json({ 
        error: "tickets must be an array" 
      });
    }

    // Tickets can be either:
    // 1. Array of ticket objects: [{ section, row, seatNumber, price, ... }]
    // 2. Array of ticket IDs (strings): ["ticket-id-1", "ticket-id-2"]
    // We'll handle both cases

    // Validate status
    if (!['pending', 'completed', 'canceled', 'refunded'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'pending', 'completed', 'canceled', 'refunded'" 
      });
    }

    // Validate payment status
    if (!['pending', 'paid', 'refunded', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ 
        error: "paymentStatus must be one of: 'pending', 'paid', 'refunded', 'failed'" 
      });
    }

    const orderId = generateId();
    const now = new Date().toISOString();
    
    // Generate secure view token for public order access
    const viewToken = generateViewToken();
    const viewTokenExpiresAt = calculateTokenExpiration();

    const order = {
      id: orderId,
      userId: sellerId, // sellerId is the userId (for backward compatibility with queries)
      sellerId, // sellerId is the userId
      productionId,
      performanceId,
      totalAmount: parseInt(totalAmount),
      status,
      paymentStatus,
      paymentMethod: paymentMethod || null,
      customerEmail: customerEmail || null, // Store customer email separately
      viewToken, // Secure token for public order viewing
      viewTokenExpiresAt, // Token expires 2 years from creation
      baseUrl: baseUrl || process.env.APP_BASE_URL || "https://www.stagepasspro.com", // Base URL for QR codes
      // Store venue/location data from frontend (same as payment intent)
      venueName: venueName || null,
      venueAddress: venueAddress || null,
      venueCity: venueCity || null,
      venueState: venueState || null,
      venueZipCode: venueZipCode || null,
      // Store performance date/time from frontend (same as payment intent)
      performanceDate: performanceDate || null,
      performanceTime: performanceTime || null,
      createdAt: now,
      updatedAt: now,
      tickets: [] // Will be populated with ticket IDs after creating tickets
    };

    const createdOrder = await OrdersController.upsertOrder(order);

    // Create tickets if provided as objects
    const ticketIds = [];
    if (tickets && tickets.length > 0) {
      // Check if tickets are objects or IDs
      const isTicketObjects = tickets[0] && typeof tickets[0] === 'object' && tickets[0].section;
      
      if (isTicketObjects) {
        // Create tickets from objects
        const orderUrl = `${order.baseUrl}/orders/${orderId}?token=${encodeURIComponent(viewToken)}`;
        
        for (const ticketData of tickets) {
          try {
            const ticketId = generateId();
            const ticket = {
              id: ticketId,
              seatId: ticketData.seatId || null,
              section: ticketData.section || null,
              row: ticketData.row || null,
              seatNumber: ticketData.seatNumber || null,
              price: parseInt(ticketData.price) || 0,
              status: 'valid',
              qrCode: orderUrl,
              createdAt: now
            };

            await TicketsController.upsertTicket(orderId, ticket);
            ticketIds.push(ticketId);
          } catch (ticketError) {
          }
        }
        
        // Update order with ticket IDs
        if (ticketIds.length > 0) {
          await OrdersController.updateOrder(orderId, { tickets: ticketIds });
        }
      } else {
        // Tickets are already IDs, just store them
        ticketIds.push(...tickets.filter(id => typeof id === 'string'));
        if (ticketIds.length > 0) {
          await OrdersController.updateOrder(orderId, { tickets: ticketIds });
        }
      }
    }

    res.status(201).json({
      success: true,
      order: createdOrder
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create order',
      message: error.message 
    });
  }
});

// READ - Get all orders
router.get("/", async (req, res) => {
  try {
    const { 
      userId, 
      sellerId,
      status,
      paymentStatus,
      productionId,
      performanceId,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    let orders;
    
    // Use specialized methods when userId or sellerId is provided for better query performance
    if (userId) {
      // Debug logging
      
      // Use getOrdersByUserId which is optimized for userId queries
      const filters = { status, paymentStatus, productionId, performanceId };
      // Remove undefined/null/empty values from filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
          delete filters[key];
        }
      });
      
      orders = await OrdersController.getOrdersByUserId(userId, filters);
      
      // Debug logging
      if (orders.length === 0) {
      }
    } else if (sellerId) {
      // Use getOrdersBySellerId which is optimized for sellerId queries
      const filters = { status, paymentStatus, productionId, performanceId };
      // Remove undefined/null/empty values from filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
          delete filters[key];
        }
      });
      
      orders = await OrdersController.getOrdersBySellerId(sellerId, filters);
    } else {
      // Use getAllOrders for general queries
      const filters = { status, paymentStatus, productionId, performanceId };
      // Remove undefined/null/empty values from filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
          delete filters[key];
        }
      });
      
      orders = await OrdersController.getAllOrders(filters);
    }
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        total: orders.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < orders.length
      },
      // Debug info in development
      ...(process.env.NODE_ENV !== 'production' && userId ? {
        debug: {
          userId: userId,
          queryFilters: { userId, sellerId, status, paymentStatus, productionId, performanceId },
          totalFound: orders.length
        }
      } : {})
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve orders',
      message: error.message 
    });
  }
});

// READ - Get order by ID (requires authentication or token)
router.get("/:orderId", optionalAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query; // Token from query parameter
    const userId = req.user?.id || req.user?.uid; // From authentication middleware if present
    
    const order = await OrdersController.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Check if user is authenticated and owns the order
    const isOwner = userId && (order.userId === userId || order.sellerId === userId);
    
    // If authenticated owner, return full order details
    if (isOwner) {
      return res.json({
        success: true,
        order,
        accessLevel: 'authenticated'
      });
    }

    // If token provided, validate it
    if (token) {
      if (order.viewToken !== token) {
        return res.status(403).json({ 
          error: 'Invalid token' 
        });
      }

      // Check if token is expired
      if (order.viewTokenExpiresAt && new Date(order.viewTokenExpiresAt) < new Date()) {
        return res.status(403).json({ 
          error: 'Token has expired. Please sign in to view this order.' 
        });
      }

      // Fetch tickets for this order (needed for QR codes)
      let tickets = [];
      try {
        tickets = await TicketsController.getAllTickets(orderId);
      } catch (err) {
      }

      // Return limited order details for token-based access (includes tickets for QR code display)
      const publicOrder = {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        productionId: order.productionId,
        performanceId: order.performanceId,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        tickets: tickets.map(t => ({
          id: t.id,
          section: t.section,
          row: t.row,
          seatNumber: t.seatNumber,
          price: t.price,
          status: t.status,
          qrCode: t.qrCode,
          // Exclude sensitive ticket data if any
        })),
        // Exclude sensitive data: userId, sellerId, paymentMethod, email, etc.
      };

      return res.json({
        success: true,
        order: publicOrder,
        accessLevel: 'public',
        message: 'Sign in to view full order details and order history'
      });
    }

    // No token and not authenticated - require authentication or token
    return res.status(401).json({ 
      error: 'Authentication required or valid token needed to view this order',
      message: 'Please sign in or use the link from your order confirmation email'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve order',
      message: error.message 
    });
  }
});

// READ - Public order access with token (explicit public endpoint)
router.get("/:orderId/public", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ 
        error: 'Token is required',
        message: 'Please provide a token from your order confirmation email'
      });
    }
    
    const order = await OrdersController.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Validate token
    if (order.viewToken !== token) {
      return res.status(403).json({ 
        error: 'Invalid token' 
      });
    }

    // Check if token is expired
    if (order.viewTokenExpiresAt && new Date(order.viewTokenExpiresAt) < new Date()) {
      return res.status(403).json({ 
        error: 'Token has expired',
        message: 'Please sign in to view this order or contact support'
      });
    }

    // Fetch tickets for this order (needed for QR codes)
    let tickets = [];
    try {
      tickets = await TicketsController.getAllTickets(orderId);
    } catch (err) {
    }

    // Return limited public order details (includes tickets for QR code display)
    const publicOrder = {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      productionId: order.productionId,
      performanceId: order.performanceId,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      tickets: tickets.map(t => ({
        id: t.id,
        section: t.section,
        row: t.row,
        seatNumber: t.seatNumber,
        price: t.price,
        status: t.status,
        qrCode: t.qrCode,
        // Exclude sensitive ticket data if any
      })),
      // Note: Excludes userId, sellerId, paymentMethod, email, and other sensitive data
    };

    res.json({
      success: true,
      order: publicOrder,
      accessLevel: 'public',
      message: 'Sign in to view full order details and order history'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve order',
      message: error.message 
    });
  }
});

// READ - Get orders by user ID
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      status,
      paymentStatus,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const orders = await OrdersController.getOrdersByUserId(userId, { status, paymentStatus });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        total: orders.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < orders.length
      }
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve user orders',
      message: error.message 
    });
  }
});

// READ - Get orders by seller ID
router.get("/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { 
      status,
      paymentStatus,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const orders = await OrdersController.getOrdersBySellerId(sellerId, { status, paymentStatus });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        total: orders.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < orders.length
      }
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve seller orders',
      message: error.message 
    });
  }
});

// UPDATE - Update order by ID
router.put("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      userId,
      sellerId,
      productionId,
      performanceId,
      totalAmount,
      status,
      paymentStatus,
      paymentMethod
    } = req.body;

    // Check if order exists
    const existingOrder = await OrdersController.getOrderById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Validate status if provided
    if (status && !['pending', 'completed', 'canceled', 'refunded'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'pending', 'completed', 'canceled', 'refunded'" 
      });
    }

    // Validate payment status if provided
    if (paymentStatus && !['pending', 'paid', 'refunded', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ 
        error: "paymentStatus must be one of: 'pending', 'paid', 'refunded', 'failed'" 
      });
    }

    // Update only provided fields
    const updatedOrder = {
      ...existingOrder,
      ...(userId !== undefined && { userId }),
      ...(sellerId !== undefined && { sellerId }),
      ...(productionId !== undefined && { productionId }),
      ...(performanceId !== undefined && { performanceId }),
      ...(totalAmount !== undefined && { totalAmount: parseInt(totalAmount) }),
      ...(status !== undefined && { status }),
      ...(paymentStatus !== undefined && { paymentStatus }),
      ...(paymentMethod !== undefined && { paymentMethod }),
      updatedAt: new Date().toISOString()
    };

    const result = await OrdersController.upsertOrder(updatedOrder);

    res.json({
      success: true,
      order: result
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update order',
      message: error.message 
    });
  }
});

// PATCH - Partially update order by ID
router.patch("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;

    // Check if order exists
    const existingOrder = await OrdersController.getOrderById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Validate status if provided
    if (updates.status && !['pending', 'completed', 'canceled', 'refunded'].includes(updates.status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'pending', 'completed', 'canceled', 'refunded'" 
      });
    }

    // Validate payment status if provided
    if (updates.paymentStatus && !['pending', 'paid', 'refunded', 'failed'].includes(updates.paymentStatus)) {
      return res.status(400).json({ 
        error: "paymentStatus must be one of: 'pending', 'paid', 'refunded', 'failed'" 
      });
    }

    // Handle totalAmount conversion if provided
    if (updates.totalAmount) {
      updates.totalAmount = parseInt(updates.totalAmount);
    }

    // Remove undefined values and add updatedAt
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    cleanUpdates.updatedAt = new Date().toISOString();

    const updatedOrder = {
      ...existingOrder,
      ...cleanUpdates
    };

    const result = await OrdersController.upsertOrder(updatedOrder);

    res.json({
      success: true,
      order: result
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update order',
      message: error.message 
    });
  }
});

// DELETE - Delete order by ID
router.delete("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Check if order exists
    const existingOrder = await OrdersController.getOrderById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    await OrdersController.deleteOrder(orderId);

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete order',
      message: error.message 
    });
  }
});

module.exports = router;
