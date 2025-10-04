const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

async function ensureDataFileExists() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.access(DATA_FILE, fs.constants.F_OK);
  } catch (_) {
    const initial = { 
      theaters: {},
      users: {},
      productions: {},
      venues: {},
      orders: {}
    };
    await fsp.writeFile(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

async function readAll() {
  await ensureDataFileExists();
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed.theaters || typeof parsed.theaters !== "object") {
      parsed.theaters = {};
    }
    if (!parsed.users || typeof parsed.users !== "object") {
      parsed.users = {};
    }
    if (!parsed.productions || typeof parsed.productions !== "object") {
      parsed.productions = {};
    }
    if (!parsed.venues || typeof parsed.venues !== "object") {
      parsed.venues = {};
    }
    if (!parsed.orders || typeof parsed.orders !== "object") {
      parsed.orders = {};
    }
    return parsed;
  } catch (e) {
    return { 
      theaters: {},
      users: {},
      productions: {},
      venues: {},
      orders: {}
    };
  }
}

async function writeAll(db) {
  await ensureDataFileExists();
  await fsp.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

async function upsertTheater(theater) {
  const db = await readAll();
  db.theaters[theater.id] = theater;
  await writeAll(db);
  return theater;
}

async function getTheaterById(theaterId) {
  const db = await readAll();
  return db.theaters[theaterId] || null;
}

async function getAllTheaters() {
  const db = await readAll();
  return Object.values(db.theaters);
}


// User functions
async function upsertUser(user) {
  const db = await readAll();
  db.users[user.id] = user;
  await writeAll(db);
  return user;
}

async function getUserById(userId) {
  const db = await readAll();
  return db.users[userId] || null;
}

async function getAllUsers() {
  const db = await readAll();
  return Object.values(db.users);
}

async function deleteUser(userId) {
  const db = await readAll();
  delete db.users[userId];
  await writeAll(db);
  return true;
}

// Production functions
async function upsertProduction(production) {
  const db = await readAll();
  db.productions[production.id] = production;
  await writeAll(db);
  return production;
}

async function getProductionById(productionId) {
  const db = await readAll();
  return db.productions[productionId] || null;
}

async function getAllProductions() {
  const db = await readAll();
  return Object.values(db.productions);
}

async function getProductionsBySellerId(sellerId) {
  const db = await readAll();
  return Object.values(db.productions).filter(p => p.sellerId === sellerId);
}

async function deleteProduction(productionId) {
  const db = await readAll();
  delete db.productions[productionId];
  await writeAll(db);
  return true;
}

// Performance functions (subcollection of productions)
async function upsertPerformance(productionId, performance) {
  const db = await readAll();
  if (!db.productions[productionId]) {
    throw new Error('Production not found');
  }
  if (!db.productions[productionId].performances) {
    db.productions[productionId].performances = {};
  }
  db.productions[productionId].performances[performance.id] = performance;
  await writeAll(db);
  return performance;
}

async function getPerformanceById(productionId, performanceId) {
  const db = await readAll();
  const production = db.productions[productionId];
  if (!production || !production.performances) {
    return null;
  }
  return production.performances[performanceId] || null;
}

async function getAllPerformances(productionId) {
  const db = await readAll();
  const production = db.productions[productionId];
  if (!production || !production.performances) {
    return [];
  }
  return Object.values(production.performances);
}

async function deletePerformance(productionId, performanceId) {
  const db = await readAll();
  const production = db.productions[productionId];
  if (production && production.performances) {
    delete production.performances[performanceId];
    await writeAll(db);
  }
  return true;
}

// Venue functions
async function upsertVenue(venue) {
  const db = await readAll();
  db.venues[venue.id] = venue;
  await writeAll(db);
  return venue;
}

async function getVenueById(venueId) {
  const db = await readAll();
  return db.venues[venueId] || null;
}

async function getAllVenues() {
  const db = await readAll();
  return Object.values(db.venues);
}

async function getVenuesBySellerId(sellerId) {
  const db = await readAll();
  return Object.values(db.venues).filter(v => v.sellerId === sellerId);
}

async function deleteVenue(venueId) {
  const db = await readAll();
  delete db.venues[venueId];
  await writeAll(db);
  return true;
}

// Seatmap functions (subcollection of venues)
async function upsertSeatmap(venueId, seatmap) {
  const db = await readAll();
  if (!db.venues[venueId]) {
    throw new Error('Venue not found');
  }
  if (!db.venues[venueId].seatmaps) {
    db.venues[venueId].seatmaps = {};
  }
  db.venues[venueId].seatmaps[seatmap.id] = seatmap;
  await writeAll(db);
  return seatmap;
}

async function getSeatmapById(venueId, seatmapId) {
  const db = await readAll();
  const venue = db.venues[venueId];
  if (!venue || !venue.seatmaps) {
    return null;
  }
  return venue.seatmaps[seatmapId] || null;
}

async function getAllSeatmaps(venueId) {
  const db = await readAll();
  const venue = db.venues[venueId];
  if (!venue || !venue.seatmaps) {
    return [];
  }
  return Object.values(venue.seatmaps);
}

async function deleteSeatmap(venueId, seatmapId) {
  const db = await readAll();
  const venue = db.venues[venueId];
  if (venue && venue.seatmaps) {
    delete venue.seatmaps[seatmapId];
    await writeAll(db);
  }
  return true;
}

// Order functions
async function upsertOrder(order) {
  const db = await readAll();
  db.orders[order.id] = order;
  await writeAll(db);
  return order;
}

async function getOrderById(orderId) {
  const db = await readAll();
  return db.orders[orderId] || null;
}

async function getAllOrders() {
  const db = await readAll();
  return Object.values(db.orders);
}

async function getOrdersByUserId(userId) {
  const db = await readAll();
  return Object.values(db.orders).filter(o => o.userId === userId);
}

async function getOrdersBySellerId(sellerId) {
  const db = await readAll();
  return Object.values(db.orders).filter(o => o.sellerId === sellerId);
}

async function deleteOrder(orderId) {
  const db = await readAll();
  delete db.orders[orderId];
  await writeAll(db);
  return true;
}

// Ticket functions (subcollection of orders)
async function upsertTicket(orderId, ticket) {
  const db = await readAll();
  if (!db.orders[orderId]) {
    throw new Error('Order not found');
  }
  if (!db.orders[orderId].tickets) {
    db.orders[orderId].tickets = {};
  }
  db.orders[orderId].tickets[ticket.id] = ticket;
  await writeAll(db);
  return ticket;
}

async function getTicketById(orderId, ticketId) {
  const db = await readAll();
  const order = db.orders[orderId];
  if (!order || !order.tickets) {
    return null;
  }
  return order.tickets[ticketId] || null;
}

async function getAllTickets(orderId) {
  const db = await readAll();
  const order = db.orders[orderId];
  if (!order || !order.tickets) {
    return [];
  }
  return Object.values(order.tickets);
}

async function deleteTicket(orderId, ticketId) {
  const db = await readAll();
  const order = db.orders[orderId];
  if (order && order.tickets) {
    delete order.tickets[ticketId];
    await writeAll(db);
  }
  return true;
}

module.exports = {
  readAll,
  writeAll,
  // Theater functions
  upsertTheater,
  getTheaterById,
  getAllTheaters,
  // User functions
  upsertUser,
  getUserById,
  getAllUsers,
  deleteUser,
  // Production functions
  upsertProduction,
  getProductionById,
  getAllProductions,
  getProductionsBySellerId,
  deleteProduction,
  // Performance functions
  upsertPerformance,
  getPerformanceById,
  getAllPerformances,
  deletePerformance,
  // Venue functions
  upsertVenue,
  getVenueById,
  getAllVenues,
  getVenuesBySellerId,
  deleteVenue,
  // Seatmap functions
  upsertSeatmap,
  getSeatmapById,
  getAllSeatmaps,
  deleteSeatmap,
  // Order functions
  upsertOrder,
  getOrderById,
  getAllOrders,
  getOrdersByUserId,
  getOrdersBySellerId,
  deleteOrder,
  // Ticket functions
  upsertTicket,
  getTicketById,
  getAllTickets,
  deleteTicket,
};



