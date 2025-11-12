require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser"); // use raw for webhooks, json for everything else

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

const app = express();
const port = process.env.PORT || 4242;
const path = require("path");

// CORS
const corsOptions = {
  origin: ["http://localhost:5173","http://127.0.0.1:5173","http://localhost:4242","http://127.0.0.1:4242","https://www.stagepasspro.com","https://stage-pass-b1d9b.web.app","https://project-theatre-ticketing-system-with-crm-integration-440.magicpatterns.app"],
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};
app.use(cors(corsOptions));

// Serve static assets (logos, images, etc.)
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));

// Serve the token helper page
app.get("/get-token", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "get-token.html"));
});

// --- Webhooks MUST be mounted before JSON parsing ---
app.use("/webhooks", bodyParser.raw({ type: "application/json" }), webhooksRouter);

// Upload route MUST be before JSON parser (multer needs to parse multipart/form-data)
// IMPORTANT: No body parsing middleware should be applied before this route
app.use("/api/upload", uploadRouter);

// JSON for everything else
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

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

// Start server - listen on all interfaces (IPv4 and IPv6)
// This ensures both localhost (IPv6 ::1) and 127.0.0.1 (IPv4) work
app.listen(port, '0.0.0.0');

