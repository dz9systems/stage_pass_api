const sgMail = require("@sendgrid/mail");
const QRCode = require("qrcode");

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    if (process.env.SENDGRID_DATA_RESIDENCY === "eu") {
      sgMail.setDataResidency("eu");
    }
  } catch (err) {
    console.error("Failed to initialize SendGrid:", err.message);
  }
} else {
  console.warn("SENDGRID_API_KEY is not set. Emails will fail to send.");
}

const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || "no-reply@example.com";

// Simple email validation
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

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

  console.log("📨 [Email] Sending greeting email", { to, subject });
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

  console.log("📨 [Email] Sending receipt email", { to, subject, orderId });
  await sgMail.send(msg);
  return { success: true };
}

async function generateQrPngBase64(data) {
  // Increase scale and margin for better scannability and visibility
  const buffer = await QRCode.toBuffer(String(data || ""), { 
    type: "png", 
    margin: 2, // Increased margin for better scanning
    scale: 10, // Increased scale for larger, clearer QR code
    errorCorrectionLevel: 'M' // Medium error correction for better reliability
  });
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
  // Validate email address
  if (!to || !isValidEmail(to)) {
    throw new Error(`Invalid 'to' email address: ${to}`);
  }
  
  // Validate FROM email
  if (!DEFAULT_FROM_EMAIL || !isValidEmail(DEFAULT_FROM_EMAIL)) {
    throw new Error(`Invalid 'from' email address: ${DEFAULT_FROM_EMAIL}. Please set SENDGRID_FROM_EMAIL in your environment variables.`);
  }
  
  const ticketId = ticket?.id || "Ticket";
  const showName = performance?.productionName || performance?.title || order?.productionName || "Performance";
  const showTime = performance?.startTime || performance?.dateTime || performance?.date || "";
  const venueName = venue?.name || performance?.venueName || "";
  const sectionRowSeat = [ticket?.section, ticket?.row, ticket?.seatNumber].filter(Boolean).join(" • ");

  const qrData = qrContent || ticket?.qrCode || `${ticketId}`;
  
  // Generate QR code and validate it was created
  let qrBase64;
  try {
    qrBase64 = await generateQrPngBase64(qrData);
    if (!qrBase64 || qrBase64.length === 0) {
      throw new Error("Failed to generate QR code");
    }
  } catch (qrError) {
    console.error("❌ [Email] QR code generation error:", qrError);
    throw new Error(`Failed to generate QR code: ${qrError.message}`);
  }
  
  // Use inline attachment with cid: reference - most reliable for email clients
  // Data URIs are often blocked by email clients (Gmail, Outlook, etc.)
  const contentId = "qr-image";

  const body = `
    <p>Here are your ticket details:</p>
    <p><strong>Event:</strong> ${showName}</p>
    ${showTime ? `<p><strong>When:</strong> ${showTime}</p>` : ""}
    ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ""}
    ${sectionRowSeat ? `<p><strong>Seat:</strong> ${sectionRowSeat}</p>` : ""}
    <p style="margin-top: 20px; margin-bottom: 10px;"><strong>Present this QR code at the venue for entry:</strong></p>
    <div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 8px;">
      <img src="cid:${contentId}" alt="Ticket QR Code - Contains: ${qrData}" style="max-width: 300px; min-width: 250px; width: 300px; height: 300px; display: block; margin: 0 auto;" />
    </div>
    <p style="font-size: 12px; color: #666; margin-top: 10px;">QR Code contains your ticket identifier: <code>${qrData}</code></p>
  `;

  const html = buildBasicHtmlWrapper("Your Ticket", body);

  // Sanitize filename - remove invalid characters
  const sanitizedFilename = `${String(ticketId).replace(/[^a-zA-Z0-9._-]/g, '_')}.png`;

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Ticket for ${showName}${showTime ? ` on ${showTime}` : ""}`,
    html,
    // Include as inline attachment as backup, but primary method is data URI in HTML
    attachments: [
      {
        content: qrBase64,
        filename: sanitizedFilename,
        type: "image/png",
        disposition: "inline",
        content_id: contentId, // SendGrid requires content_id (with underscore) for inline attachments
      },
    ],
  };

  console.log("📨 [Email] Sending single ticket email", { 
    to, 
    from: DEFAULT_FROM_EMAIL,
    subject, 
    ticketId, 
    filename: sanitizedFilename,
    qrData: qrData, // Log what the QR code contains
    qrDataLength: qrData.length,
    attachmentSize: Math.round(qrBase64.length / 1024) + 'KB',
    contentId: contentId
  });
  
  try {
    await sgMail.send(msg);
    console.log("✅ [Email] Ticket email sent successfully");
    return { success: true };
  } catch (error) {
    // Log detailed SendGrid error information
    console.error("❌ [Email] SendGrid error details:", {
      message: error.message,
      code: error.code,
      response: error.response ? {
        statusCode: error.response.statusCode,
        body: error.response.body,
        headers: error.response.headers,
      } : null,
    });
    
    // If SendGrid provides error details, include them
    if (error.response && error.response.body && error.response.body.errors) {
      const sendGridErrors = error.response.body.errors;
      console.error("📋 [Email] SendGrid validation errors:", JSON.stringify(sendGridErrors, null, 2));
      
      // Check for common errors and provide helpful messages
      const errorMessages = sendGridErrors.map(e => {
        const field = e.field || '';
        const message = e.message || '';
        
        // Common SendGrid errors
        if (field.includes('from') || message.includes('from') || message.includes('sender')) {
          return `FROM email (${DEFAULT_FROM_EMAIL}) is not verified in SendGrid. Please verify your sender email in SendGrid settings.`;
        }
        if (message.includes('attachment') || field.includes('attachments')) {
          return `Attachment error: ${message}. Check that the QR code was generated correctly.`;
        }
        if (message.includes('invalid') || message.includes('format')) {
          return `${field ? `Field '${field}': ` : ''}${message}`;
        }
        
        return message || field || 'Unknown error';
      });
      
      throw new Error(`SendGrid error: ${errorMessages.join('; ')}`);
    }
    
    throw error;
  }
}

module.exports = {
  sendGreetingEmail,
  sendReceiptEmail,
  sendTicketEmail,
  sendTicketsEmail: async function sendTicketsEmail({ to, subject = "Your Stage Pass Tickets", order, tickets = [], performance, venue }) {
    const showName = performance?.productionName || performance?.title || order?.productionName || "Performance";
    const showTime = performance?.startTime || performance?.dateTime || performance?.date || "";
    const venueName = venue?.name || performance?.venueName || "";

    // Build ticket list with inline attachments - most reliable for email clients
    const images = [];
    const listItems = [];
    let idx = 0;
    for (const ticket of tickets) {
      const contentId = `qr-${idx}`;
      const qrData = ticket?.qrCode || ticket?.id || String(idx + 1);
      console.log(`🎫 [Email] Generating QR code for ticket ${idx + 1}:`, { ticketId: ticket?.id, qrCode: ticket?.qrCode, qrData });
      const qrBase64 = await generateQrPngBase64(qrData);
      
      // Sanitize filename - remove invalid characters
      const ticketIdForFile = ticket?.id || `ticket-${idx+1}`;
      const sanitizedTicketFilename = `${String(ticketIdForFile).replace(/[^a-zA-Z0-9._-]/g, '_')}.png`;
      
      images.push({
        content: qrBase64,
        filename: sanitizedTicketFilename,
        type: "image/png",
        disposition: "inline",
        content_id: contentId, // SendGrid requires content_id (with underscore) for inline attachments
      });
      
      const sectionRowSeat = [ticket?.section, ticket?.row, ticket?.seatNumber].filter(Boolean).join(" • ");
      listItems.push(`
        <li style="margin-bottom: 20px; padding: 15px; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 8px;">
          <div style="margin-bottom: 10px;"><strong>${sectionRowSeat || ticket?.id || `Ticket ${idx+1}`}</strong></div>
          <div style="text-align: center; padding: 10px;">
            <img src="cid:${contentId}" alt="Ticket QR Code - Contains: ${qrData}" style="max-width: 250px; min-width: 200px; width: 250px; height: 250px; display: block; margin: 0 auto;" />
          </div>
          <p style="font-size: 11px; color: #666; margin-top: 5px;">ID: <code>${qrData}</code></p>
        </li>
      `);
      idx += 1;
    }
    console.log(`📎 [Email] Prepared ${images.length} QR code images for email`);

    const listHtml = listItems.length ? `<ol style="list-style: none; padding: 0;">${listItems.join("")}</ol>` : "<p>No tickets found.</p>";
    const body = `
      <p>Here are your tickets:</p>
      <p><strong>Event:</strong> ${showName}</p>
      ${showTime ? `<p><strong>When:</strong> ${showTime}</p>` : ""}
      ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ""}
      ${listHtml}
      <p style="font-size: 12px; color: #666; margin-top: 20px;">Present the QR codes above at the venue for entry. Each QR code contains a unique ticket identifier that will be scanned to verify your ticket.</p>
    `;

    const html = buildBasicHtmlWrapper("Your Tickets", body);

    const msg = {
      to,
      from: DEFAULT_FROM_EMAIL,
      subject,
      text: `Tickets for ${showName}${showTime ? ` on ${showTime}` : ""}`,
      html,
      attachments: images, // Inline attachments for QR codes
    };

    console.log("📨 [Email] Sending consolidated tickets email", { to, subject, ticketCount: tickets?.length || 0 });
    
    try {
      await sgMail.send(msg);
      return { success: true };
    } catch (error) {
      // Log detailed SendGrid error information
      console.error("❌ [Email] SendGrid error details:", {
        message: error.message,
        code: error.code,
        response: error.response ? {
          statusCode: error.response.statusCode,
          body: error.response.body,
          headers: error.response.headers,
        } : null,
      });
      
      // If SendGrid provides error details, include them
      if (error.response && error.response.body && error.response.body.errors) {
        const sendGridErrors = error.response.body.errors;
        console.error("📋 [Email] SendGrid validation errors:", JSON.stringify(sendGridErrors, null, 2));
        throw new Error(`SendGrid error: ${sendGridErrors.map(e => e.message || e.field || 'Unknown error').join('; ')}`);
      }
      
      throw error;
    }
  },
};


