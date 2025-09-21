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

// Start server
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
