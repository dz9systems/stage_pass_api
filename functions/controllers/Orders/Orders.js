const { db, docToObject, docsToObjects, addTimestamps, generateId, applyPagination, buildQuery } = require('../BaseController');

class OrdersController {
  constructor() {
    this.collection = 'orders';
  }

  // Create or update an order
  async upsertOrder(order) {
    try {
      const orderData = addTimestamps(order, !!order.id);
      const orderRef = db.collection(this.collection).doc(order.id);
      await orderRef.set(orderData, { merge: true });
      return orderData;
    } catch (error) {
      throw new Error(`Failed to upsert order: ${error.message}`);
    }
  }

  // Get order by ID
  async getOrderById(orderId) {
    try {
      const orderDoc = await db.collection(this.collection).doc(orderId).get();
      return docToObject(orderDoc);
    } catch (error) {
      throw new Error(`Failed to get order by ID: ${error.message}`);
    }
  }

  // Get all orders with optional filtering and pagination
  async getAllOrders(filters = {}, pagination = {}) {
    try {
      const ordersRef = db.collection(this.collection);
      const query = buildQuery(ordersRef, filters);
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      const orders = docsToObjects(snapshot.docs);
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(orders, pagination.limit, pagination.offset);
      }
      
      return orders;
    } catch (error) {
      throw new Error(`Failed to get all orders: ${error.message}`);
    }
  }

  // Get orders by user ID
  async getOrdersByUserId(userId, filters = {}, pagination = {}) {
    try {
      const ordersRef = db.collection(this.collection);
      let query = ordersRef.where('userId', '==', userId);
      
      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query = query.where(key, '==', value);
        }
      });
      
      // Try to use orderBy with index, fallback to in-memory sort if index not ready
      let orders;
      try {
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        orders = docsToObjects(snapshot.docs);
      } catch (indexError) {
        // If index is not ready yet, fetch without orderBy and sort in memory
        if (indexError.message && indexError.message.includes('index')) {
          const snapshot = await query.get();
          orders = docsToObjects(snapshot.docs);
          // Sort in memory by createdAt descending
          orders.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
          });
        } else {
          throw indexError;
        }
      }
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(orders, pagination.limit, pagination.offset);
      }
      
      return orders;
    } catch (error) {
      throw new Error(`Failed to get orders by user ID: ${error.message}`);
    }
  }

  // Get orders by seller ID
  async getOrdersBySellerId(sellerId, filters = {}, pagination = {}) {
    try {
      const ordersRef = db.collection(this.collection);
      let query = ordersRef.where('sellerId', '==', sellerId);
      
      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query = query.where(key, '==', value);
        }
      });
      
      // Try to use orderBy with index, fallback to in-memory sort if index not ready
      let orders;
      try {
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        orders = docsToObjects(snapshot.docs);
      } catch (indexError) {
        // If index is not ready yet, fetch without orderBy and sort in memory
        if (indexError.message && indexError.message.includes('index')) {
          const snapshot = await query.get();
          orders = docsToObjects(snapshot.docs);
          // Sort in memory by createdAt descending
          orders.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
          });
        } else {
          throw indexError;
        }
      }
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(orders, pagination.limit, pagination.offset);
      }
      
      return orders;
    } catch (error) {
      throw new Error(`Failed to get orders by seller ID: ${error.message}`);
    }
  }

  // Get orders by production ID
  async getOrdersByProductionId(productionId, pagination = {}) {
    try {
      return await this.getAllOrders({ productionId }, pagination);
    } catch (error) {
      throw new Error(`Failed to get orders by production ID: ${error.message}`);
    }
  }

  // Get orders by performance ID
  async getOrdersByPerformanceId(performanceId, pagination = {}) {
    try {
      return await this.getAllOrders({ performanceId }, pagination);
    } catch (error) {
      throw new Error(`Failed to get orders by performance ID: ${error.message}`);
    }
  }

  // Get orders by status
  async getOrdersByStatus(status, pagination = {}) {
    try {
      return await this.getAllOrders({ status }, pagination);
    } catch (error) {
      throw new Error(`Failed to get orders by status: ${error.message}`);
    }
  }

  // Get orders by payment status
  async getOrdersByPaymentStatus(paymentStatus, pagination = {}) {
    try {
      return await this.getAllOrders({ paymentStatus }, pagination);
    } catch (error) {
      throw new Error(`Failed to get orders by payment status: ${error.message}`);
    }
  }

  // Update order
  async updateOrder(orderId, updateData) {
    try {
      const orderRef = db.collection(this.collection).doc(orderId);
      const updateDataWithTimestamp = addTimestamps(updateData, true);
      await orderRef.update(updateDataWithTimestamp);
      return { id: orderId, ...updateDataWithTimestamp };
    } catch (error) {
      throw new Error(`Failed to update order: ${error.message}`);
    }
  }

  // Update order status
  async updateOrderStatus(orderId, status) {
    try {
      return await this.updateOrder(orderId, { status });
    } catch (error) {
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }

  // Update payment status
  async updatePaymentStatus(orderId, paymentStatus) {
    try {
      return await this.updateOrder(orderId, { paymentStatus });
    } catch (error) {
      throw new Error(`Failed to update payment status: ${error.message}`);
    }
  }

  // Cancel order
  async cancelOrder(orderId, reason = null) {
    try {
      const updateData = { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason
      };
      return await this.updateOrder(orderId, updateData);
    } catch (error) {
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  // Delete order
  async deleteOrder(orderId) {
    try {
      await db.collection(this.collection).doc(orderId).delete();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete order: ${error.message}`);
    }
  }

  // Get order statistics
  async getOrderStats(sellerId = null, dateRange = null) {
    try {
      const ordersRef = db.collection(this.collection);
      let query = ordersRef;
      
      if (sellerId) {
        query = query.where('sellerId', '==', sellerId);
      }
      
      if (dateRange && dateRange.start && dateRange.end) {
        query = query
          .where('createdAt', '>=', new Date(dateRange.start))
          .where('createdAt', '<=', new Date(dateRange.end));
      }
      
      const snapshot = await query.get();
      const orders = docsToObjects(snapshot.docs);
      
      const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length,
        completed: orders.filter(o => o.status === 'completed').length,
        paid: orders.filter(o => o.paymentStatus === 'paid').length,
        pendingPayment: orders.filter(o => o.paymentStatus === 'pending').length,
        failed: orders.filter(o => o.paymentStatus === 'failed').length,
        refunded: orders.filter(o => o.paymentStatus === 'refunded').length,
        totalRevenue: orders
          .filter(o => o.paymentStatus === 'paid')
          .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
        averageOrderValue: orders.length > 0 
          ? orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / orders.length 
          : 0
      };
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get order stats: ${error.message}`);
    }
  }

  // Get recent orders
  async getRecentOrders(limit = 10, sellerId = null) {
    try {
      const ordersRef = db.collection(this.collection);
      let query = ordersRef.orderBy('createdAt', 'desc').limit(limit);
      
      if (sellerId) {
        query = ordersRef.where('sellerId', '==', sellerId).orderBy('createdAt', 'desc').limit(limit);
      }
      
      const snapshot = await query.get();
      return docsToObjects(snapshot.docs);
    } catch (error) {
      throw new Error(`Failed to get recent orders: ${error.message}`);
    }
  }

  // Search orders by customer name or order ID
  async searchOrders(searchTerm, pagination = {}) {
    try {
      const ordersRef = db.collection(this.collection);
      const snapshot = await ordersRef.get();
      const orders = docsToObjects(snapshot.docs);
      
      // Filter by search term (case insensitive)
      const filteredOrders = orders.filter(order => 
        order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (pagination.limit || pagination.offset) {
        return applyPagination(filteredOrders, pagination.limit, pagination.offset);
      }
      
      return filteredOrders;
    } catch (error) {
      throw new Error(`Failed to search orders: ${error.message}`);
    }
  }
}

module.exports = new OrdersController();
