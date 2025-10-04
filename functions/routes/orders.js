const express = require("express");
const router = express.Router();
const { OrdersController, TicketsController } = require("../controllers");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new order
router.post("/", async (req, res) => {
  try {
    const {
      userId,
      sellerId,
      productionId,
      performanceId,
      totalAmount,
      status = 'pending',
      paymentStatus = 'pending',
      paymentMethod,
      tickets = []
    } = req.body;

    // Validate required fields
    if (!userId || !sellerId || !productionId || !performanceId || !totalAmount) {
      return res.status(400).json({ 
        error: "userId, sellerId, productionId, performanceId, and totalAmount are required" 
      });
    }

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

    const order = {
      id: orderId,
      userId,
      sellerId,
      productionId,
      performanceId,
      totalAmount: parseInt(totalAmount),
      status,
      paymentStatus,
      paymentMethod: paymentMethod || null,
      createdAt: now,
      updatedAt: now,
      tickets: {} // Initialize empty tickets subcollection
    };

    const createdOrder = await OrdersController.upsertOrder(order);

    // Add tickets if provided
    if (tickets && tickets.length > 0) {
      for (const ticket of tickets) {
        const ticketId = generateId();
        const ticketData = {
          id: ticketId,
          seatId: ticket.seatId || null,
          section: ticket.section || null,
          row: ticket.row || null,
          seatNumber: ticket.seatNumber || null,
          price: parseInt(ticket.price) || 0,
          status: 'valid',
          qrCode: `QR_${ticketId}_${Date.now()}`,
          createdAt: now
        };
        await TicketsController.upsertTicket(orderId, ticketData);
      }
    }

    res.status(201).json({
      success: true,
      order: createdOrder
    });

  } catch (error) {
    console.error('Order creation error:', error);
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
    
    const orders = await OrdersController.getAllOrders({ userId, sellerId, status, paymentStatus, productionId, performanceId });
    
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
    console.error('Orders retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve orders',
      message: error.message 
    });
  }
});

// READ - Get order by ID
router.get("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await OrdersController.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Order retrieval error:', error);
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
    console.error('User orders retrieval error:', error);
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
    console.error('Seller orders retrieval error:', error);
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
    console.error('Order update error:', error);
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
    console.error('Order patch error:', error);
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
    console.error('Order deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete order',
      message: error.message 
    });
  }
});

module.exports = router;
