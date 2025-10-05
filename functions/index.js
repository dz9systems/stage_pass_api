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
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://stage-pass-b1d9b.web.app"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Stage Pass API - Firebase Functions - Full API',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// CRUD API routes
app.use('/api/users', usersRouter);
app.use('/api/productions', productionsRouter);
app.use('/api/productions', performancesRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/venues', seatmapsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/orders', ticketsRouter);

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
