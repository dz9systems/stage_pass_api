const sgMail = require("@sendgrid/mail");
const QRCode = require("qrcode");

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    if (process.env.SENDGRID_DATA_RESIDENCY === "eu") {
      // Optional EU data residency
      sgMail.setDataResidency("eu");
    }
  } catch (err) {
    console.error("Failed to initialize SendGrid:", err.message);
  }
} else {
  console.warn("SENDGRID_API_KEY is not set. Emails will fail to send.");
}

const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || "no-reply@example.com";

function buildBasicHtmlWrapper(title, bodyHtml) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#111;">
      <h2 style="margin-bottom:16px;">${title}</h2>
      <div style="font-size:15px; line-height:1.5;">${bodyHtml}</div>
      <hr style="margin:24px 0; border:none; border-top:1px solid #eee;"/>
      <div style="font-size:12px; color:#666;">This email was sent by Stage Pass.</div>
    </div>
  `;
}

async function sendGreetingEmail({ to, name, subject = "Welcome to Stage Pass!" }) {
  const html = buildBasicHtmlWrapper(
    "Welcome",
    `<p>Hi ${name || "there"},</p>
     <p>Welcome to Stage Pass. We're excited to have you!</p>`
  );

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Hi ${name || "there"}, Welcome to Stage Pass!`,
    html,
  };

  await sgMail.send(msg);
  return { success: true };
}

async function sendReceiptEmail({ to, subject = "Your Stage Pass Receipt", order }) {
  const amount = order?.totalAmount != null ? (Number(order.totalAmount) / 100).toFixed(2) : "-";
  const orderId = order?.id || order?.orderId || "Unknown";
  const lines = Array.isArray(order?.items) ? order.items : [];

  const itemsHtml = lines.length
    ? `<ul>${lines.map((l) => `<li>${l.name || "Item"} — $${((Number(l.price)||0)/100).toFixed(2)} x ${l.quantity || 1}</li>`).join("")}</ul>`
    : "";

  const html = buildBasicHtmlWrapper(
    "Receipt",
    `<p>Thanks for your purchase.</p>
     <p><strong>Order ID:</strong> ${orderId}</p>
     ${itemsHtml}
     <p><strong>Total:</strong> $${amount}</p>`
  );

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Order ${orderId} total $${amount}`,
    html,
  };

  await sgMail.send(msg);
  return { success: true };
}

async function generateQrPngBase64(data) {
  const buffer = await QRCode.toBuffer(String(data || ""), { type: "png", margin: 1, scale: 6 });
  return buffer.toString("base64");
}

async function sendTicketEmail({
  to,
  subject = "Your Stage Pass Ticket",
  ticket,
  order,
  performance,
  venue,
  qrContent,
}) {
  const ticketId = ticket?.id || "Ticket";
  const showName = performance?.productionName || performance?.title || order?.productionName || "Performance";
  const showTime = performance?.startTime || performance?.dateTime || performance?.date || "";
  const venueName = venue?.name || performance?.venueName || "";
  const sectionRowSeat = [ticket?.section, ticket?.row, ticket?.seatNumber].filter(Boolean).join(" • ");

  const qrData = qrContent || ticket?.qrCode || `${ticketId}`;
  const qrBase64 = await generateQrPngBase64(qrData);
  const contentId = "qr-image";

  const body = `
    <p>Here are your ticket details:</p>
    <p><strong>Event:</strong> ${showName}</p>
    ${showTime ? `<p><strong>When:</strong> ${showTime}</p>` : ""}
    ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ""}
    ${sectionRowSeat ? `<p><strong>Seat:</strong> ${sectionRowSeat}</p>` : ""}
    <p>Present this QR code at the venue:</p>
    <img src="cid:${contentId}" alt="Ticket QR" style="width:200px;height:200px;" />
  `;

  const html = buildBasicHtmlWrapper("Your Ticket", body);

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Ticket for ${showName}${showTime ? ` on ${showTime}` : ""}`,
    html,
    attachments: [
      {
        content: qrBase64,
        filename: `${ticketId}.png`,
        type: "image/png",
        disposition: "inline",
        contentId,
      },
    ],
  };

  await sgMail.send(msg);
  return { success: true };
}

module.exports = {
  sendGreetingEmail,
  sendReceiptEmail,
  sendTicketEmail,
  sendTicketsEmail: async function sendTicketsEmail({ to, subject = "Your Stage Pass Tickets", order, tickets = [], performance, venue }) {
    const showName = performance?.productionName || performance?.title || order?.productionName || "Performance";
    const showTime = performance?.startTime || performance?.dateTime || performance?.date || "";
    const venueName = venue?.name || performance?.venueName || "";

    // Build ticket list and inline images
    const images = [];
    const listItems = [];
    let idx = 0;
    for (const ticket of tickets) {
      const contentId = `qr-${idx}`;
      const qrData = ticket?.qrCode || ticket?.id || String(idx + 1);
      console.log(`🎫 [Email] Generating QR code for ticket ${idx + 1}:`, { ticketId: ticket?.id, qrCode: ticket?.qrCode, qrData });
      const qrBase64 = await generateQrPngBase64(qrData);
      images.push({
        content: qrBase64,
        filename: `${ticket?.id || `ticket-${idx+1}`}.png`,
        type: "image/png",
        disposition: "inline",
        contentId,
      });
      const sectionRowSeat = [ticket?.section, ticket?.row, ticket?.seatNumber].filter(Boolean).join(" • ");
      listItems.push(`<li><div><strong>${sectionRowSeat || ticket?.id || `Ticket ${idx+1}`}</strong></div><img src="cid:${contentId}" alt="Ticket QR" style="width:160px;height:160px;margin:8px 0;"/></li>`);
      idx += 1;
    }
    console.log(`📎 [Email] Prepared ${images.length} QR code images for email`);

    const listHtml = listItems.length ? `<ol>${listItems.join("")}</ol>` : "<p>No tickets found.</p>";
    const body = `
      <p>Here are your tickets:</p>
      <p><strong>Event:</strong> ${showName}</p>
      ${showTime ? `<p><strong>When:</strong> ${showTime}</p>` : ""}
      ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ""}
      ${listHtml}
    `;

    const html = buildBasicHtmlWrapper("Your Tickets", body);

    const msg = {
      to,
      from: DEFAULT_FROM_EMAIL,
      subject,
      text: `Tickets for ${showName}${showTime ? ` on ${showTime}` : ""}`,
      html,
      attachments: images,
    };

    await sgMail.send(msg);
    return { success: true };
  },
};


