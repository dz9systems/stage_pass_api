require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser"); // use raw for webhooks, json for everything else

// Each of these files should `module.exports = router`
const connectExpressRouter = require("./routes/connectExpress.js");
const connectStandardRouter = require("./routes/connectStandard");
const paymentsRouter = require("./routes/payments");
const webhooksRouter = require("./routes/webhooks"); // expects raw-body for signature verification
const stripeDataRouter = require("./routes/dashboard");

// New CRUD route modules
const usersRouter = require("./routes/users");
const productionsRouter = require("./routes/productions");
const performancesRouter = require("./routes/performances");
const venuesRouter = require("./routes/venues");
const seatmapsRouter = require("./routes/seatmaps");
const ordersRouter = require("./routes/orders");
const ticketsRouter = require("./routes/tickets");

const app = express();
const port = process.env.PORT || 4242;

// CORS
const corsOptions = {
  origin: ["http://localhost:5173","http://127.0.0.1:5173","https://stage-pass-b1d9b.web.app"],
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};
app.use(cors(corsOptions));

// --- Webhooks MUST be mounted before JSON parsing ---
app.use("/webhooks", bodyParser.raw({ type: "application/json" }), webhooksRouter);

// JSON for everything else
app.use(bodyParser.json());

// Feature routers
app.use("/connect/express", connectExpressRouter);
app.use("/connect/standard", connectStandardRouter);
app.use("/payments", paymentsRouter);
app.use("/stripe-data", stripeDataRouter);

// CRUD API routers
app.use("/api/users", usersRouter);
app.use("/api/productions", productionsRouter);
app.use("/api/productions", performancesRouter); // performances are subcollection of productions
app.use("/api/venues", venuesRouter);
app.use("/api/venues", seatmapsRouter); // seatmaps are subcollection of venues
app.use("/api/orders", ordersRouter);
app.use("/api/orders", ticketsRouter); // tickets are subcollection of orders

// Start server
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
