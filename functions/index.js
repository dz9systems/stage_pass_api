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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Stage Pass API - Firebase Functions',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    note: 'This is a simplified Firebase Functions deployment. For full API functionality, use the main server.'
  });
});

// Basic API endpoints for testing
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
