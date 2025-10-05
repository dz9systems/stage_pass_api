const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://stage-pass-b1d9b.web.app',
    'https://project-theatre-ticketing-system-with-crm-integration-440.magicpatterns.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Import route modules
const usersRouter = require('./routes/users');
const productionsRouter = require('./routes/productions');
const performancesRouter = require('./routes/performances');
const venuesRouter = require('./routes/venues');
const seatmapsRouter = require('./routes/seatmaps');
const ordersRouter = require('./routes/orders');
const ticketsRouter = require('./routes/tickets');
const uploadRouter = require('./routes/upload');

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Stage Pass API - Firebase Functions - Full API',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// CRUD API routes
app.use('/users', usersRouter);
app.use('/productions', productionsRouter);
app.use('/productions', performancesRouter);
app.use('/venues', venuesRouter);
app.use('/venues', seatmapsRouter);
app.use('/orders', ordersRouter);
app.use('/orders', ticketsRouter);
app.use('/upload', uploadRouter);

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
