const express = require("express");
const router = express.Router();
const { TicketsController, OrdersController } = require("../controllers");

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CREATE - Create a new ticket for an order
router.post("/:orderId/tickets", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      seatId,
      section,
      row,
      seatNumber,
      price,
      status = 'valid'
    } = req.body;

    // Validate required fields
    if (!seatId || !section || !row || !seatNumber || !price) {
      return res.status(400).json({ 
        error: "seatId, section, row, seatNumber, and price are required" 
      });
    }

    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Validate status
    if (!['valid', 'used', 'canceled', 'refunded'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'valid', 'used', 'canceled', 'refunded'" 
      });
    }

    const ticketId = generateId();
    const now = new Date().toISOString();

    const ticket = {
      id: ticketId,
      seatId,
      section,
      row,
      seatNumber,
      price: parseInt(price),
      status,
      qrCode: `QR_${ticketId}_${Date.now()}`,
      createdAt: now
    };

    const createdTicket = await TicketsController.upsertTicket(orderId, ticket);

    res.status(201).json({
      success: true,
      ticket: createdTicket
    });

  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create ticket',
      message: error.message 
    });
  }
});

// READ - Get all tickets for an order
router.get("/:orderId/tickets", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      status,
      section,
      limit = 100, 
      offset = 0 
    } = req.query;
    
    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }
    
    const tickets = await TicketsController.getAllTickets(orderId, { status, section });
    
    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedTickets = tickets.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      orderId,
      tickets: paginatedTickets,
      pagination: {
        total: tickets.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < tickets.length
      }
    });

  } catch (error) {
    console.error('Tickets retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve tickets',
      message: error.message 
    });
  }
});

// READ - Get ticket by ID
router.get("/:orderId/tickets/:ticketId", async (req, res) => {
  try {
    const { orderId, ticketId } = req.params;
    
    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }
    
    const ticket = await TicketsController.getTicketById(orderId, ticketId);
    
    if (!ticket) {
      return res.status(404).json({ 
        error: 'Ticket not found' 
      });
    }

    res.json({
      success: true,
      ticket
    });

  } catch (error) {
    console.error('Ticket retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve ticket',
      message: error.message 
    });
  }
});

// UPDATE - Update ticket by ID
router.put("/:orderId/tickets/:ticketId", async (req, res) => {
  try {
    const { orderId, ticketId } = req.params;
    const {
      seatId,
      section,
      row,
      seatNumber,
      price,
      status
    } = req.body;

    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Check if ticket exists
    const existingTicket = await TicketsController.getTicketById(orderId, ticketId);
    if (!existingTicket) {
      return res.status(404).json({ 
        error: 'Ticket not found' 
      });
    }

    // Validate status if provided
    if (status && !['valid', 'used', 'canceled', 'refunded'].includes(status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'valid', 'used', 'canceled', 'refunded'" 
      });
    }

    // Update only provided fields
    const updatedTicket = {
      ...existingTicket,
      ...(seatId !== undefined && { seatId }),
      ...(section !== undefined && { section }),
      ...(row !== undefined && { row }),
      ...(seatNumber !== undefined && { seatNumber }),
      ...(price !== undefined && { price: parseInt(price) }),
      ...(status !== undefined && { status })
    };

    const result = await TicketsController.upsertTicket(orderId, updatedTicket);

    res.json({
      success: true,
      ticket: result
    });

  } catch (error) {
    console.error('Ticket update error:', error);
    res.status(500).json({ 
      error: 'Failed to update ticket',
      message: error.message 
    });
  }
});

// PATCH - Partially update ticket by ID
router.patch("/:orderId/tickets/:ticketId", async (req, res) => {
  try {
    const { orderId, ticketId } = req.params;
    const updates = req.body;

    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Check if ticket exists
    const existingTicket = await TicketsController.getTicketById(orderId, ticketId);
    if (!existingTicket) {
      return res.status(404).json({ 
        error: 'Ticket not found' 
      });
    }

    // Validate status if provided
    if (updates.status && !['valid', 'used', 'canceled', 'refunded'].includes(updates.status)) {
      return res.status(400).json({ 
        error: "status must be one of: 'valid', 'used', 'canceled', 'refunded'" 
      });
    }

    // Handle price conversion if provided
    if (updates.price) {
      updates.price = parseInt(updates.price);
    }

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    const updatedTicket = {
      ...existingTicket,
      ...cleanUpdates
    };

    const result = await TicketsController.upsertTicket(orderId, updatedTicket);

    res.json({
      success: true,
      ticket: result
    });

  } catch (error) {
    console.error('Ticket patch error:', error);
    res.status(500).json({ 
      error: 'Failed to update ticket',
      message: error.message 
    });
  }
});

// DELETE - Delete ticket by ID
router.delete("/:orderId/tickets/:ticketId", async (req, res) => {
  try {
    const { orderId, ticketId } = req.params;
    
    // Check if order exists
    const order = await OrdersController.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Check if ticket exists
    const existingTicket = await TicketsController.getTicketById(orderId, ticketId);
    if (!existingTicket) {
      return res.status(404).json({ 
        error: 'Ticket not found' 
      });
    }

    await TicketsController.deleteTicket(orderId, ticketId);

    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });

  } catch (error) {
    console.error('Ticket deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete ticket',
      message: error.message 
    });
  }
});

module.exports = router;
