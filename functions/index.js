/* eslint-disable max-len */
/* eslint-disable quotes */
require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");

// Each of these files should `module.exports = router`
const connectExpressRouter = require("./routes/connectExpress.js");
const connectStandardRouter = require("./routes/connectStandard");
const paymentsRouter = require("./routes/payments");
const webhooksRouter = require("./routes/webhooks");
const stripeDataRouter = require("./routes/dashboard");

// New CRUD route modules
const usersRouter = require("./routes/users");
const productionsRouter = require("./routes/productions");
const performancesRouter = require("./routes/performances");
const venuesRouter = require("./routes/venues");
const seatmapsRouter = require("./routes/seatmaps");
const ordersRouter = require("./routes/orders");
const ticketsRouter = require("./routes/tickets");
const uploadRouter = require("./routes/upload");
const subscriptionsRouter = require("./routes/subscriptions");
const emailsRouter = require("./routes/emails");
// Load Firestore triggers
require("./triggers/usersOnCreate");

const app = express();
const path = require("path");

// Enable trust proxy for Cloud Run
app.enable('trust proxy');

// CORS
const corsOptions = {
  origin: ["http://localhost:5173","http://127.0.0.1:5173","https://www.stagepasspro.com","https://stage-pass-b1d9b.web.app","https://project-theatre-ticketing-system-with-crm-integration-440.magicpatterns.app"],
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};
app.use(cors(corsOptions));

// Serve static assets (logos, images, etc.)
// Path goes up one level from functions/ to access root assets/ folder
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));

// --- Webhooks MUST be mounted before JSON parsing ---
app.use("/webhooks", bodyParser.raw({ type: "application/json" }), webhooksRouter);

// Upload route MUST be before JSON parser (multer needs to parse multipart/form-data)
app.use("/api/upload", uploadRouter);

// Explicit OPTIONS handler for CORS preflight on upload route
app.options("/api/upload", cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Feature routers
app.use("/connect/express", connectExpressRouter);
app.use("/connect/standard", connectStandardRouter);
app.use("/payments", paymentsRouter);
app.use("/stripe-data", stripeDataRouter);

// CRUD API routers
app.use("/api/users", usersRouter);
app.use("/api/productions", productionsRouter);
app.use("/api/productions", performancesRouter); // performances are subcollection of productions
app.use("/api/performances", performancesRouter); // global performances endpoint
app.use("/api/venues", venuesRouter);
app.use("/api/venues", seatmapsRouter); // seatmaps are subcollection of venues
app.use("/api/orders", ordersRouter);
app.use("/api/orders", ticketsRouter); // tickets are subcollection of orders
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/emails", emailsRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Export as Firebase Function (Gen 2)
exports.api = onRequest({
  timeoutSeconds: 540,
  memory: "512MiB",
  maxInstances: 20
}, app);

