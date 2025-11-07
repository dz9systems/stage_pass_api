const express = require("express");
const router = express.Router();

const {
  sendGreetingEmail,
  sendReceiptEmail,
  sendTicketEmail,
} = require("../services/email");
const { verifyFirebaseIdToken } = require("../middleware/auth");

// Protect all email endpoints with Firebase auth
router.use(verifyFirebaseIdToken);

// POST /api/emails/greeting
router.post("/greeting", async (req, res) => {
  try {
    const { to, name, subject } = req.body || {};
    if (!to) return res.status(400).json({ error: "Missing 'to'" });
    await sendGreetingEmail({ to, name, subject });
    res.json({ success: true });
  } catch (err) {
    console.error("Greeting email error:", err);
    res.status(500).json({ error: "Failed to send greeting", message: err.message });
  }
});

// POST /api/emails/receipt
router.post("/receipt", async (req, res) => {
  try {
    const { to, subject, order } = req.body || {};
    if (!to) return res.status(400).json({ error: "Missing 'to'" });
    await sendReceiptEmail({ to, subject, order });
    res.json({ success: true });
  } catch (err) {
    console.error("Receipt email error:", err);
    res.status(500).json({ error: "Failed to send receipt", message: err.message });
  }
});

// POST /api/emails/ticket
router.post("/ticket", async (req, res) => {
  try {
    const { to, subject, ticket, order, performance, venue, qrContent } = req.body || {};
    if (!to) return res.status(400).json({ error: "Missing 'to'" });
    await sendTicketEmail({ to, subject, ticket, order, performance, venue, qrContent });
    res.json({ success: true });
  } catch (err) {
    console.error("Ticket email error:", err);
    // Include SendGrid error details if available
    const statusCode = err.response?.statusCode || 500;
    const errorMessage = err.message || "Failed to send ticket";
    res.status(statusCode).json({ 
      error: "Failed to send ticket", 
      message: errorMessage,
      details: err.response?.body?.errors || null
    });
  }
});

module.exports = router;



