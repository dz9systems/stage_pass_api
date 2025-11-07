const {
  db,
  docToObject,
  docsToObjects,
  addTimestamps,
  applyPagination
} = require('../BaseController');

class TicketsController {
  constructor() {
    this.parentCollection = 'orders';
    this.subcollection = 'tickets';
  }

  // Create or update a ticket
  async upsertTicket(orderId, ticket) {
    try {
      const ticketData = addTimestamps(ticket, !!ticket.id);
      const ticketRef = db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection)
        .doc(ticket.id);
      await ticketRef.set(ticketData, { merge: true });
      return ticketData;
    } catch (error) {
      throw new Error(`Failed to upsert ticket: ${error.message}`);
    }
  }

  // Get ticket by ID
  async getTicketById(orderId, ticketId) {
    try {
      const ticketDoc = await db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection)
        .doc(ticketId)
        .get();
      return docToObject(ticketDoc);
    } catch (error) {
      throw new Error(`Failed to get ticket by ID: ${error.message}`);
    }
  }

  // Get all tickets for an order
  async getAllTickets(orderId, filters = {}, pagination = {}) {
    try {
      const ticketsRef = db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection);

      let query = ticketsRef;

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'status') {
            query = query.where('status', '==', value);
          } else if (key === 'section') {
            query = query.where('section', '==', value);
          } else if (key === 'row') {
            query = query.where('row', '==', value);
          } else if (key === 'seatType') {
            query = query.where('seatType', '==', value);
          }
        }
      });

      const snapshot = await query
        .orderBy('section')
        .orderBy('row')
        .orderBy('seatNumber')
        .get();
      const tickets = docsToObjects(snapshot.docs);

      if (pagination.limit || pagination.offset) {
        return applyPagination(tickets, pagination.limit, pagination.offset);
      }

      return tickets;
    } catch (error) {
      throw new Error(`Failed to get all tickets: ${error.message}`);
    }
  }

  // Get tickets by status
  async getTicketsByStatus(orderId, status, pagination = {}) {
    try {
      return await this.getAllTickets(orderId, { status }, pagination);
    } catch (error) {
      throw new Error(`Failed to get tickets by status: ${error.message}`);
    }
  }

  // Get tickets by section
  async getTicketsBySection(orderId, section, pagination = {}) {
    try {
      return await this.getAllTickets(orderId, { section }, pagination);
    } catch (error) {
      throw new Error(`Failed to get tickets by section: ${error.message}`);
    }
  }

  // Get tickets by seat type
  async getTicketsBySeatType(orderId, seatType, pagination = {}) {
    try {
      return await this.getAllTickets(orderId, { seatType }, pagination);
    } catch (error) {
      throw new Error(`Failed to get tickets by seat type: ${error.message}`);
    }
  }

  // Update ticket
  async updateTicket(orderId, ticketId, updateData) {
    try {
      const ticketRef = db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection)
        .doc(ticketId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await ticketRef.update(updateDataWithTimestamp);
      return { id: ticketId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update ticket: ${error.message}`);
    }
  }

  // Update ticket status
  async updateTicketStatus(orderId, ticketId, status) {
    try {
      return await this.updateTicket(orderId, ticketId, { status });
    } catch (error) {
      throw new Error(`Failed to update ticket status: ${error.message}`);
    }
  }

  // Validate ticket
  async validateTicket(orderId, ticketId) {
    try {
      const ticket = await this.getTicketById(orderId, ticketId);

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (ticket.status !== 'valid') {
        throw new Error('Ticket is not valid');
      }

      // Mark as used
      await this.updateTicketStatus(orderId, ticketId, 'used');

      return {
        valid: true,
        ticket,
        validatedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to validate ticket: ${error.message}`);
    }
  }

  // Cancel ticket
  async cancelTicket(orderId, ticketId, reason = null) {
    try {
      const updateData = {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason
      };
      return await this.updateTicket(orderId, ticketId, updateData);
    } catch (error) {
      throw new Error(`Failed to cancel ticket: ${error.message}`);
    }
  }

  // Transfer ticket
  async transferTicket(orderId, ticketId, newOwnerId, newOwnerName) {
    try {
      const updateData = {
        ownerId: newOwnerId,
        ownerName: newOwnerName,
        transferredAt: new Date(),
        status: 'transferred'
      };
      return await this.updateTicket(orderId, ticketId, updateData);
    } catch (error) {
      throw new Error(`Failed to transfer ticket: ${error.message}`);
    }
  }

  // Delete ticket
  async deleteTicket(orderId, ticketId) {
    try {
      await db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection)
        .doc(ticketId)
        .delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete ticket: ${error.message}`);
    }
  }

  // Get ticket statistics for an order
  async getTicketStats(orderId) {
    try {
      const ticketsRef = db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection);

      const snapshot = await ticketsRef.get();
      const tickets = docsToObjects(snapshot.docs);

      const stats = {
        total: tickets.length,
        valid: tickets.filter(t => t.status === 'valid').length,
        used: tickets.filter(t => t.status === 'used').length,
        cancelled: tickets.filter(t => t.status === 'cancelled').length,
        transferred: tickets.filter(t => t.status === 'transferred').length,
        totalValue: tickets.reduce((sum, t) => sum + (t.price || 0), 0),
        averagePrice: tickets.length > 0
          ? tickets.reduce((sum, t) => sum + (t.price || 0), 0) / tickets.length
          : 0,
        sections: [...new Set(tickets.map(t => t.section).filter(Boolean))],
        seatTypes: [...new Set(tickets.map(t => t.seatType).filter(Boolean))]
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get ticket stats: ${error.message}`);
    }
  }

  // Get tickets by performance
  async getTicketsByPerformance(performanceId, pagination = {}) {
    try {
      // First get all orders for this performance
      const ordersRef = db.collection('orders');
      const ordersQuery = ordersRef.where('performanceId', '==', performanceId);
      const ordersSnapshot = await ordersQuery.get();

      let allTickets = [];

      for (const orderDoc of ordersSnapshot.docs) {
        const ticketsRef = orderDoc.ref.collection(this.subcollection);
        const ticketsSnapshot = await ticketsRef.get();
        const tickets = docsToObjects(ticketsSnapshot.docs);

        // Add order info to each ticket
        const ticketsWithOrder = tickets.map(ticket => ({
          ...ticket,
          orderId: orderDoc.id,
          orderStatus: orderDoc.data().status
        }));

        allTickets = allTickets.concat(ticketsWithOrder);
      }

      if (pagination.limit || pagination.offset) {
        return applyPagination(allTickets, pagination.limit, pagination.offset);
      }

      return allTickets;
    } catch (error) {
      throw new Error(`Failed to get tickets by performance: ${error.message}`);
    }
  }

  // Get tickets by user
  async getTicketsByUser(userId, pagination = {}) {
    try {
      // First get all orders for this user
      const ordersRef = db.collection('orders');
      const ordersQuery = ordersRef.where('userId', '==', userId);
      const ordersSnapshot = await ordersQuery.get();

      let allTickets = [];

      for (const orderDoc of ordersSnapshot.docs) {
        const ticketsRef = orderDoc.ref.collection(this.subcollection);
        const ticketsSnapshot = await ticketsRef.get();
        const tickets = docsToObjects(ticketsSnapshot.docs);

        // Add order info to each ticket
        const ticketsWithOrder = tickets.map(ticket => ({
          ...ticket,
          orderId: orderDoc.id,
          orderStatus: orderDoc.data().status
        }));

        allTickets = allTickets.concat(ticketsWithOrder);
      }

      if (pagination.limit || pagination.offset) {
        return applyPagination(allTickets, pagination.limit, pagination.offset);
      }

      return allTickets;
    } catch (error) {
      throw new Error(`Failed to get tickets by user: ${error.message}`);
    }
  }

  // Search tickets
  async searchTickets(orderId, searchTerm, pagination = {}) {
    try {
      const ticketsRef = db.collection(this.parentCollection)
        .doc(orderId)
        .collection(this.subcollection);

      const snapshot = await ticketsRef.get();
      const tickets = docsToObjects(snapshot.docs);

      // Filter by search term (case insensitive)
      const filteredTickets = tickets.filter(ticket =>
        ticket.seatNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.section?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.row?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.ownerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredTickets, pagination.limit, pagination.offset);
      }

      return filteredTickets;
    } catch (error) {
      throw new Error(`Failed to search tickets: ${error.message}`);
    }
  }

  // Get all tickets across all orders (admin function)
  async getAllTicketsAcrossOrders(filters = {}, pagination = {}) {
    try {
      const ordersRef = db.collection(this.parentCollection);
      const ordersSnapshot = await ordersRef.get();

      let allTickets = [];

      for (const orderDoc of ordersSnapshot.docs) {
        const ticketsRef = orderDoc.ref.collection(this.subcollection);
        const ticketsSnapshot = await ticketsRef.get();
        const tickets = docsToObjects(ticketsSnapshot.docs);

        // Add order info to each ticket
        const ticketsWithOrder = tickets.map(ticket => ({
          ...ticket,
          orderId: orderDoc.id,
          orderStatus: orderDoc.data().status,
          userId: orderDoc.data().userId,
          sellerId: orderDoc.data().sellerId
        }));

        allTickets = allTickets.concat(ticketsWithOrder);
      }

      // Apply filters
      if (filters.status) {
        allTickets = allTickets.filter(t => t.status === filters.status);
      }
      if (filters.section) {
        allTickets = allTickets.filter(t => t.section === filters.section);
      }
      if (filters.seatType) {
        allTickets = allTickets.filter(t => t.seatType === filters.seatType);
      }
      if (filters.userId) {
        allTickets = allTickets.filter(t => t.userId === filters.userId);
      }
      if (filters.sellerId) {
        allTickets = allTickets.filter(t => t.sellerId === filters.sellerId);
      }

      if (pagination.limit || pagination.offset) {
        return applyPagination(allTickets, pagination.limit, pagination.offset);
      }

      return allTickets;
    } catch (error) {
      throw new Error(`Failed to get all tickets across orders: ${error.message}`);
    }
  }
}

module.exports = new TicketsController();
