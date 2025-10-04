// Export all controllers
const UsersController = require('./Users/Users');
const ProductionsController = require('./Productions/Productions');
const VenuesController = require('./Venues/Venues');
const OrdersController = require('./Orders/Orders');
const PerformancesController = require('./Performances/Performances');
const SeatmapsController = require('./Seatmaps/Seatmaps');
const TicketsController = require('./Tickets/Tickets');

module.exports = {
  UsersController,
  ProductionsController,
  VenuesController,
  OrdersController,
  PerformancesController,
  SeatmapsController,
  TicketsController
};
