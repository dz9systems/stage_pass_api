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
  }
} else {
}

const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || "no-reply@example.com";
const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/stage-pass-b1d9b.firebasestorage.app/o/STAGE%20PASS%20LOGO.png?alt=media&token=6814dd6b-eeca-47dc-95e2-55159801a3eb'

// Optional default reply-to email (e.g., your Gmail inbox)
const DEFAULT_REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || process.env.SUPPORT_EMAIL || null;

// Basic config logging (once on boot)
try {
  const maskedKey = process.env.SENDGRID_API_KEY ? `${process.env.SENDGRID_API_KEY.slice(0, 4)}...` : 'not-set';
  // Only minimal, non-sensitive info
  
} catch (_) {}

// Simple email validation
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Build sender name with optional seller branding
function buildSenderName(seller = null) {
  if (seller?.companyName) {
    return `Stage Pass Pro - ${seller.companyName}`;
  } else if (seller?.displayName) {
    return `Stage Pass Pro - ${seller.displayName}`;
  }
  return "Stage Pass Pro";
}

// Build email footer with seller contact info
function buildEmailFooter(seller = null) {
  let footer = '<div style="font-size:12px; color:#666; margin-top:24px; padding-top:16px; border-top:1px solid #eee;">';
  footer += '<p style="margin:4px 0;">This email was sent by Stage Pass Pro.</p>';

  if (seller) {
    if (seller.companyName || seller.displayName) {
      footer += `<p style="margin:4px 0;"><strong>${seller.companyName || seller.displayName}</strong></p>`;
    }
    if (seller.email) {
      footer += `<p style="margin:4px 0;">Questions? Reply to this email or contact us at <a href="mailto:${seller.email}" style="color:#0066cc;">${seller.email}</a></p>`;
    }
    if (seller.phone) {
      footer += `<p style="margin:4px 0;">Phone: ${seller.phone}</p>`;
    }
  } else {
    footer += '<p style="margin:4px 0;">Questions? Reply to this email for customer support.</p>';
  }

  footer += '</div>';
  return footer;
}

function buildBasicHtmlWrapper(title, bodyHtml, seller = null) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .email-wrapper {
            padding: 15px !important;
          }
          .email-title {
            font-size: 22px !important;
          }
          .email-body {
            font-size: 15px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center" class="email-wrapper" style="padding: 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; padding: 30px;">
              <tr>
                <td>
                  <h2 class="email-title" style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold; color: #111;">${title}</h2>
                  <div class="email-body" style="font-size: 15px; line-height: 1.6; color: #111;">${bodyHtml}</div>
                  ${buildEmailFooter(seller)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Build Order Summary email template matching the design
function buildOrderSummaryTemplate({ order, tickets = [], performance, venue, seller = null }) {
  const orderId = order?.id || order?.orderId || "Unknown";

  // Use performance date/time instead of order creation date
  // Try to get performance datetime, or combine date/time from order if needed
  let performanceDate = performance?.startTime || performance?.dateTime || performance?.date || performance?.startDate || null;
  
  // If we have separate date and time from order, combine them
  if (!performanceDate && order?.performanceDate && order?.performanceTime) {
    performanceDate = `${order.performanceDate}T${order.performanceTime}:00`;
  } else if (!performanceDate && order?.performanceDate) {
    performanceDate = `${order.performanceDate}T00:00:00`;
  }
  
  // Format date as "Nov 10, 2025 @ 9:00PM"
  let formattedWhen = null;
  if (performanceDate) {
    try {
      const dateObj = new Date(performanceDate);
      if (isNaN(dateObj.getTime())) {
        // Invalid date, try to parse it differently or use order date
        throw new Error('Invalid date');
      }
      // Format: "Nov 10, 2025 @ 9:00PM"
      const month = dateObj.toLocaleString('en-US', { month: 'short' });
      const day = dateObj.getDate();
      const year = dateObj.getFullYear();
      const time = dateObj.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      formattedWhen = `${month} ${day}, ${year} @ ${time}`;
    } catch (err) {
      // Fallback to order creation date if performance date is invalid
      performanceDate = null;
    }
  }
  
  if (!formattedWhen) {
    const fallbackDate = order?.createdAt ? new Date(order.createdAt) : new Date();
    const month = fallbackDate.toLocaleString('en-US', { month: 'short' });
    const day = fallbackDate.getDate();
    const year = fallbackDate.getFullYear();
    const time = fallbackDate.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    formattedWhen = `${month} ${day}, ${year} @ ${time}`;
  }

  const organizerName = seller?.companyName || seller?.displayName || "Stage Pass Pro";
  const eventName = performance?.productionName || performance?.title || order?.productionName || "Event";
  const venueName = venue?.name || performance?.venueName || "";
  const venueAddress = venue?.address || performance?.venueAddress || "";
  const venueCity = venue?.city || performance?.venueCity || "";
  const venueState = venue?.state || performance?.venueState || "";
  const venueZip = venue?.zipCode || venue?.zip || performance?.venueZip || "";

  // Build location HTML - always show if we have any venue info
  const locationHtml = (venueName || venueAddress || venueCity || venueState || venueZip)
    ? `<div style="line-height: 1.6;">
         ${venueName ? `<div style="font-weight: 500;">${venueName}</div>` : ""}
         ${venueAddress ? `<div>${venueAddress}</div>` : ""}
         ${venueCity || venueState || venueZip ? `<div>${[venueCity, venueState, venueZip].filter(Boolean).join(", ")}</div>` : ""}
       </div>`
    : "";

  const totalAmount = order?.totalAmount != null ? (Number(order.totalAmount) / 100).toFixed(2) : "0.00";

  // Build ticket entries with QR codes using table layout for email compatibility
  // Use baseUrl from order (set by frontend) or fallback to production URL
  const baseUrl = order?.baseUrl || process.env.APP_BASE_URL || "https://www.stagepasspro.com";
  const viewToken = order?.viewToken || "";
  const orderUrl = viewToken
    ? `${baseUrl}/orders/${orderId}?token=${encodeURIComponent(viewToken)}`
    : `${baseUrl}/orders/${orderId}`;

  let ticketsHtml = "";
  if (tickets && tickets.length > 0) {
    ticketsHtml = tickets.map((ticket, idx) => {
      // Format seating: Section: General, Seat: A1 (combining row and seatNumber)
      const section = ticket?.section || "General";
      const seat = ticket?.row && ticket?.seatNumber 
        ? `${ticket.row}${ticket.seatNumber}` 
        : ticket?.seatNumber || ticket?.row || "";
      
      const ticketPrice = ticket?.price != null ? (Number(ticket.price) / 100).toFixed(2) : "0.00";
      const qrCodeCid = ticket?.qrCodeCid || null;
      const qrCodeBase64 = ticket?.qrCodeBase64 || null;

      return `
        <table class="ticket-table" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 4px;">
          <tr>
            <td style="padding: 15px; vertical-align: top;">
              <table class="ticket-table-inner" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="ticket-qr-cell" style="padding-right: 15px; vertical-align: top; width: 100px; text-align: left;">
                    ${
                      qrCodeCid
                        ? `<img class="ticket-qr" src="cid:${qrCodeCid}" alt="QR Code - ${orderUrl}" width="100" height="100" style="width: 100px; height: 100px; max-width: 100px; display: block; border: 1px solid #e0e0e0; border-radius: 4px;" border="0" />`
                        : (qrCodeBase64
                            ? `<img class="ticket-qr" src="data:image/png;base64,${qrCodeBase64}" alt="QR Code - ${orderUrl}" width="100" height="100" style="width: 100px; height: 100px; max-width: 100px; display: block; border: 1px solid #e0e0e0; border-radius: 4px;" border="0" />`
                            : '<div style="width: 100px; height: 100px; background-color: #f0f0f0; border: 1px solid #ddd; border-radius: 4px;"></div>')
                    }
                  </td>
                  <td style="vertical-align: top;">
                    <div style="font-weight: bold; margin-bottom: 5px; font-size: 16px; line-height: 1.4;">${eventName}</div>
                    <div style="margin-bottom: 3px; font-size: 16px; line-height: 1.4;">
                      <strong>Section:</strong> ${section}
                    </div>
                    ${seat ? `
                    <div style="margin-bottom: 5px; font-size: 16px; line-height: 1.4;">
                      <strong>Seat:</strong> ${seat}
                    </div>
                    ` : ""}
                    <div style="font-weight: bold; color: #000; font-size: 16px;">$${ticketPrice}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }).join("");
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .email-container {
            width: 100% !important;
            max-width: 100% !important;
          }
          .email-padding {
            padding: 20px 15px !important;
          }
          .header-padding {
            padding: 20px 15px !important;
          }
          .header-title {
            font-size: 22px !important;
            margin-top: 10px !important;
          }
          .logo-cell {
            width: 100px !important;
          }
          .header-table {
            display: block !important;
          }
          .header-table td {
            display: block !important;
            text-align: center !important;
            width: 100% !important;
          }
          .ticket-qr {
            width: 80px !important;
            height: 80px !important;
            max-width: 80px !important;
          }
          .order-info-table td {
            font-size: 14px !important;
            padding: 8px 0 !important;
          }
          .order-info-table {
            font-size: 14px !important;
          }
          .order-info-table td[style*="text-align: right"] {
            text-align: left !important;
            padding-top: 2px !important;
          }
          .total-amount {
            font-size: 20px !important;
          }
          .ticket-table-inner {
            display: block !important;
          }
          .ticket-table-inner tr {
            display: block !important;
          }
          .ticket-table-inner td {
            display: block !important;
            width: 100% !important;
            padding: 10px 0 !important;
            text-align: left !important;
          }
          .ticket-qr-cell {
            text-align: center !important;
            padding-bottom: 10px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table class="email-container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px; width: 100%;">
              <!-- Header -->
              <tr>
                <td class="header-padding" style="background-color: #000000; padding: 30px 40px; text-align: left;">
                  <table class="header-table" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td class="logo-cell" width="120" valign="middle" style="width: 120px;">
                        ${LOGO_URL ? `
                          <img src="${LOGO_URL}" alt="Stage Pass" style="max-width: 120px; height: auto; display: block;" />
                        ` : `
                          <div style="background-color: #ffffff; color: #000000; padding: 10px 15px; border-radius: 4px; font-weight: bold; font-size: 14px; text-align: center; display: inline-block;">
                            STAGE PASS
                          </div>
                        `}
                      </td>
                      <td valign="middle" align="right" style="text-align: right;">
                        <h1 class="header-title" style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Thank you for your order!</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Order Summary Section -->
              <tr>
                <td class="email-padding" style="padding: 30px 40px;">
                  <h2 style="margin: 0 0 15px 0; font-size: 20px; font-weight: bold; color: #000;">Order Summary</h2>
                  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 15px 0;">

                  <table class="order-info-table" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 5px 0; font-size: 15px;"><strong>Order #:</strong></td>
                      <td style="padding: 5px 0; text-align: right; font-size: 15px;">${orderId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; font-size: 15px;"><strong>Organizer:</strong></td>
                      <td style="padding: 5px 0; text-align: right; font-size: 15px;">${organizerName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; font-size: 15px;"><strong>When:</strong></td>
                      <td style="padding: 5px 0; text-align: right; font-size: 15px;">${formattedWhen}</td>
                    </tr>
                    ${locationHtml ? `
                    <tr>
                      <td style="padding: 5px 0; font-size: 15px;" valign="top"><strong>Location:</strong></td>
                      <td style="padding: 5px 0; text-align: right; font-size: 15px;">${locationHtml}</td>
                    </tr>
                    ` : ""}
                  </table>

                  <!-- Tickets Section -->
                  ${ticketsHtml ? `
                  <div style="margin-top: 30px;">
                    ${ticketsHtml}
                  </div>
                  ` : ""}

                  <!-- Total Section -->
                  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 10px 0; font-size: 18px; font-weight: bold;">Total:</td>
                      <td class="total-amount" style="padding: 10px 0; text-align: right; font-size: 24px; font-weight: bold;">$${totalAmount}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Build Welcome email template matching the design
function buildWelcomeTemplate({ name = "there", role }) {
  // Format name for greeting - use first name if available, otherwise "there"
  const displayName = name && name !== "there" ? name.split(' ')[0] : "";
  const headingName = name && name !== "there" ? `, ${name.split(' ')[0]}` : "";
  const supportEmail = (DEFAULT_REPLY_TO_EMAIL && isValidEmail(DEFAULT_REPLY_TO_EMAIL))
    ? DEFAULT_REPLY_TO_EMAIL
    : DEFAULT_FROM_EMAIL;
  
  // Seller-specific content (exact copy requested)
  const sellerContentHtml = `
                  <p style="margin: 0 0 16px 0;">Hi${displayName ? ` ${displayName}` : ""},</p>

                  <p style="margin: 0 0 16px 0;">Welcome to <strong>StagePass Pro</strong> — we're thrilled to have you on board!</p>

                  <p style="margin: 0 0 16px 0;">StagePass Pro is built to help theaters like yours simplify ticketing, manage seat maps effortlessly, and keep every production running smoothly. You now have access to powerful tools that put full control of your venue in your hands — from customizable seating charts to real-time sales analytics.</p>

                  <h3 style="margin: 30px 0 15px 0; font-size: 18px; font-weight: bold; color: #000000;">Here's how to get started:</h3>

                  <ol style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8; color: #333333;">
                    <li style="margin-bottom: 8px;">Log in to your dashboard and set up your first production.</li>
                    <li style="margin-bottom: 8px;">Customize your seat map and pricing tiers.</li>
                    <li style="margin-bottom: 8px;">Start selling tickets and track performance in real time.</li>
                  </ol>

                  <p style="margin: 30px 0 16px 0;">If you ever need help, our support team is always here for you — just reach out to <a href="mailto:${supportEmail}" style="color: #0066cc; text-decoration: none;">${supportEmail}</a>.</p>

                  <p style="margin: 20px 0 16px 0; font-weight: bold; color: #000000;">Welcome to the future of theater ticketing.</p>

                  <p style="margin: 30px 0 0 0;"><strong>The StagePass Pro Team</strong></p>
  `;

  // Default content (non-seller roles)
  const defaultIntro = role === 'admin'
    ? `You're set up with administrative access to manage venues, shows, users, and operations across StagePass Pro.`
    : `You're all set to discover shows and purchase tickets with a smooth checkout and instant email delivery.`;

  const defaultSteps = role === 'admin'
    ? [
        'Review current organizations, venues, and productions.',
        'Invite team members and assign roles.',
        'Monitor sales and system activity.'
      ]
    : [
        'Browse upcoming shows from your favorite venues.',
        'Choose your seats and complete checkout.',
        'Watch for your ticket email with a QR code.'
      ];

  const defaultContentHtml = `
                  <p style="margin: 0 0 16px 0;">Hi${displayName ? ` ${displayName}` : ""},</p>

                  <p style="margin: 0 0 16px 0;">Welcome to <strong>StagePass Pro</strong> — we're thrilled to have you on board!</p>

                  <p style="margin: 0 0 16px 0;">${defaultIntro}</p>

                  <h3 style="margin: 30px 0 15px 0; font-size: 18px; font-weight: bold; color: #000000;">Here's how to get started:</h3>

                  <ol style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8; color: #333333;">
                    <li style="margin-bottom: 8px;">${defaultSteps[0]}</li>
                    <li style="margin-bottom: 8px;">${defaultSteps[1]}</li>
                    <li style="margin-bottom: 8px;">${defaultSteps[2]}</li>
                  </ol>

                  <p style="margin: 30px 0 16px 0;">If you ever need help, our support team is always here for you — just reach out to <a href="mailto:${supportEmail}" style="color: #0066cc; text-decoration: none;">${supportEmail}</a>.</p>

                  <p style="margin: 20px 0 16px 0; font-weight: bold; color: #000000;">Welcome to the future of theater ticketing.</p>

                  <p style="margin: 30px 0 0 0;"><strong>The StagePass Pro Team</strong></p>
  `;

  const contentHtml = role === 'seller' ? sellerContentHtml : defaultContentHtml;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
              <!-- Logo -->
              <tr>
                <td align="center" style="padding-bottom: 30px;">
                  ${LOGO_URL ? `
                    <img src="${LOGO_URL}" alt="Stage Pass" style="max-width: 200px; height: auto; display: block; margin: 0 auto;" />
                  ` : `
                    <div style="background-color: #000000; color: #ffffff; width: 80px; height: 80px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; text-align: center;">
                      STAGE<br>PASS
                    </div>
                  `}
                </td>
              </tr>

              <!-- Heading -->
              <tr>
                <td align="center" style="padding-bottom: 20px;">
                  <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #000000;">Thanks for signing up${headingName}!</h1>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 0 20px 30px 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                  ${contentHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendGreetingEmail({ to, name, role, subject = "Thanks for signing up!" }) {
  const html = buildWelcomeTemplate({ name: name || "there", role });

  const senderName = buildSenderName(null);
  const msg = {
    to,
    from: {
      email: DEFAULT_FROM_EMAIL,
      name: senderName
    },
    subject: subject || "Thanks for signing up!",
    text: `Hi ${name || "there"}, Thanks for signing up! Welcome to StagePass Pro.`,
    html,
  };

  // Add default Reply-To if configured
  if (DEFAULT_REPLY_TO_EMAIL && isValidEmail(DEFAULT_REPLY_TO_EMAIL)) {
    msg.replyTo = DEFAULT_REPLY_TO_EMAIL;
  }

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    // Surface SendGrid error details if present
    const statusCode = error?.response?.statusCode;
    const sgErrors = error?.response?.body?.errors;
    if (sgErrors && Array.isArray(sgErrors)) {
      const messages = sgErrors.map(e => e.message || e.field || 'Unknown error').join('; ');
      throw new Error(`SendGrid error: ${messages}`);
    }
    throw error;
  }
}

async function sendReceiptEmail({ to, subject = "Thank you for your order!", order, seller = null, replyTo = null, performance = null, venue = null, tickets = [] }) {
  // Use Order Summary template (can work with or without tickets)
  const html = buildOrderSummaryTemplate({ order, tickets: [], performance, venue, seller });

  const senderName = buildSenderName(seller);
  const msg = {
    to,
    from: {
      email: DEFAULT_FROM_EMAIL,
      name: senderName
    },
    subject: subject || "Thank you for your order!",
    text: `Thank you for your order! Order #${order?.id || order?.orderId || "Unknown"}`,
    html,
  };

  // Add replyTo if provided
  if (replyTo && isValidEmail(replyTo)) {
    msg.replyTo = replyTo;
  } else if (DEFAULT_REPLY_TO_EMAIL && isValidEmail(DEFAULT_REPLY_TO_EMAIL)) {
    msg.replyTo = DEFAULT_REPLY_TO_EMAIL;
  } else if (seller?.email && isValidEmail(seller.email)) {
    msg.replyTo = seller.email;
  }

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    throw error;
  }
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

// Helper function to build inline PNG attachment with CID for email clients
function inlinePngAttachment(base64, cid, filename = 'qr.png') {
  return {
    content: base64,           // already base64
    filename,
    type: 'image/png',
    disposition: 'inline',
    content_id: cid,           // SendGrid requires content_id (with underscore) for inline attachments
  };
}


async function sendTicketEmail({
  to,
  subject = "Your Stage Pass Ticket",
  ticket,
  order,
  performance,
  venue,
  qrContent,
  seller = null,
  replyTo = null,
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
  
  // Format date/time as "Nov 10, 2025 @ 9:00PM"
  let formattedWhen = null;
  const performanceDate = performance?.startTime || performance?.dateTime || performance?.date || null;
  if (performanceDate) {
    try {
      const dateObj = new Date(performanceDate);
      if (!isNaN(dateObj.getTime())) {
        const month = dateObj.toLocaleString('en-US', { month: 'short' });
        const day = dateObj.getDate();
        const year = dateObj.getFullYear();
        const time = dateObj.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        formattedWhen = `${month} ${day}, ${year} @ ${time}`;
      }
    } catch (err) {
      // Use raw value if parsing fails
      formattedWhen = performanceDate;
    }
  }
  
  // Fallback to order date/time if available
  if (!formattedWhen && order?.performanceDate && order?.performanceTime) {
    try {
      const combinedDateTime = `${order.performanceDate}T${order.performanceTime}:00`;
      const dateObj = new Date(combinedDateTime);
      if (!isNaN(dateObj.getTime())) {
        const month = dateObj.toLocaleString('en-US', { month: 'short' });
        const day = dateObj.getDate();
        const year = dateObj.getFullYear();
        const time = dateObj.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        formattedWhen = `${month} ${day}, ${year} @ ${time}`;
      }
    } catch (err) {
      // Ignore
    }
  }
  
  const venueName = venue?.name || performance?.venueName || "";
  
  // Format seating: Section and Seat (combining row and seatNumber)
  const section = ticket?.section || "General";
  const seat = ticket?.row && ticket?.seatNumber 
    ? `${ticket.row}${ticket.seatNumber}` 
    : ticket?.seatNumber || ticket?.row || "";

  // Use order URL with token for QR code, fallback to provided qrContent or ticket data
  // Use baseUrl from order (set by frontend) or fallback to production URL
  const orderId = order?.id || order?.orderId;
  const viewToken = order?.viewToken || "";
  const baseUrl = order?.baseUrl || process.env.APP_BASE_URL || "https://www.stagepasspro.com";
  const orderUrl = orderId && viewToken
    ? `${baseUrl}/orders/${orderId}?token=${encodeURIComponent(viewToken)}`
    : orderId
      ? `${baseUrl}/orders/${orderId}`
      : null;
  const qrData = qrContent || orderUrl || ticket?.qrCode || `${ticketId}`;

  // Generate QR code and validate it was created
  let qrBase64;
  try {
    qrBase64 = await generateQrPngBase64(qrData);
    if (!qrBase64 || qrBase64.length === 0) {
      throw new Error("Failed to generate QR code");
    }
  } catch (qrError) {
    throw new Error(`Failed to generate QR code: ${qrError.message}`);
  }

  // Use data URI for QR code (reverted from CID/Firebase Storage)
  const qrDataUri = `data:image/png;base64,${qrBase64}`;

  const body = `
    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">Here are your ticket details:</p>
    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;"><strong>Event:</strong> ${showName}</p>
    ${formattedWhen ? `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;"><strong>When:</strong> ${formattedWhen}</p>` : ""}
    ${venueName ? `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;"><strong>Venue:</strong> ${venueName}</p>` : ""}
    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 5px 0;"><strong>Section:</strong> ${section}</p>
    ${seat ? `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 10px 0;"><strong>Seat:</strong> ${seat}</p>` : ""}
    <p style="margin-top: 20px; margin-bottom: 10px; font-size: 16px; line-height: 1.6;"><strong>Present this QR code at the venue for entry:</strong></p>
    <div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 8px;">
      <img src="${qrDataUri}" alt="Ticket QR Code - Contains: ${qrData}" width="300" height="300" style="max-width: 100%; width: 300px; height: auto; min-width: 200px; display: block; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 4px;" border="0" />
    </div>
    <p style="font-size: 12px; color: #666; margin-top: 10px; line-height: 1.5;">QR Code contains your ticket identifier: <code style="font-size: 11px; word-break: break-all;">${qrData}</code></p>
  `;

  const html = buildBasicHtmlWrapper("Your Ticket", body, seller);

  const senderName = buildSenderName(seller);
  const msg = {
    to,
    from: {
      email: DEFAULT_FROM_EMAIL,
      name: senderName
    },
    subject,
    text: `Ticket for ${showName}${showTime ? ` on ${showTime}` : ""}`,
    html
  };

  // Add replyTo if provided
  if (replyTo && isValidEmail(replyTo)) {
    msg.replyTo = replyTo;
  } else if (seller?.email && isValidEmail(seller.email)) {
    msg.replyTo = seller.email;
  }

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {

    // If SendGrid provides error details, include them
    if (error.response && error.response.body && error.response.body.errors) {
        const sendGridErrors = error.response.body.errors;
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
  sendTicketsEmail: async function sendTicketsEmail({ to, subject = "Thank you for your order!", order, tickets = [], performance, venue, seller = null, replyTo = null }) {
    // Validate email address
    if (!to || !isValidEmail(to)) {
      throw new Error(`Invalid 'to' email address: ${to}`);
    }

    // Validate FROM email
    if (!DEFAULT_FROM_EMAIL || !isValidEmail(DEFAULT_FROM_EMAIL)) {
      throw new Error(`Invalid 'from' email address: ${DEFAULT_FROM_EMAIL}. Please set SENDGRID_FROM_EMAIL in your environment variables.`);
    }

    // Generate QR codes for all tickets using order URL with token
    // Use baseUrl from order (set by frontend) or fallback to production URL
    const orderId = order?.id || order?.orderId || "Unknown";
    const viewToken = order?.viewToken || "";
    const baseUrl = order?.baseUrl || process.env.APP_BASE_URL || "https://www.stagepasspro.com";
    const orderUrl = viewToken
      ? `${baseUrl}/orders/${orderId}?token=${encodeURIComponent(viewToken)}`
      : `${baseUrl}/orders/${orderId}`;

    const ticketsWithQRCodes = [];
    const attachments = [];

    for (let idx = 0; idx < tickets.length; idx++) {
      const ticket = tickets[idx];

      try {
        // Generate QR code as base64
        const qrBase64 = await generateQrPngBase64(orderUrl);
        // Use a simple, clean CID format - clean any special chars that might break CID matching
        const qrCid = `qr-${orderId}-${idx}`.replace(/[^a-zA-Z0-9-]/g, '-');
        attachments.push(inlinePngAttachment(qrBase64, qrCid, `ticket-${orderId}-${idx}.png`));
        ticketsWithQRCodes.push({
          ...ticket,
          qrCodeCid: qrCid
        });
      } catch (qrError) {
        // Continue with ticket even if QR code generation fails
        ticketsWithQRCodes.push({
          ...ticket,
          qrCodeCid: null,
          qrCodeBase64: null
        });
      }
    }

    // Debug logging to see what data we have

    // Use Order Summary template with tickets
    const html = buildOrderSummaryTemplate({ order, tickets: ticketsWithQRCodes, performance, venue, seller });

    const senderName = buildSenderName(seller);
    const msg = {
      to,
      from: {
        email: DEFAULT_FROM_EMAIL,
        name: senderName
      },
      subject: subject || "Thank you for your order!",
      text: `Thank you for your order! Order #${order?.id || order?.orderId || "Unknown"}`,
      html,
      attachments
    };

    // Add replyTo if provided
    if (replyTo && isValidEmail(replyTo)) {
      msg.replyTo = replyTo;
    } else if (DEFAULT_REPLY_TO_EMAIL && isValidEmail(DEFAULT_REPLY_TO_EMAIL)) {
      msg.replyTo = DEFAULT_REPLY_TO_EMAIL;
    } else if (seller?.email && isValidEmail(seller.email)) {
      msg.replyTo = seller.email;
    }

    try {
      await sgMail.send(msg);
      return { success: true };
    } catch (error) {
      // If SendGrid provides error details, include them
      if (error.response && error.response.body && error.response.body.errors) {
        const sendGridErrors = error.response.body.errors;
        const errorMessages = sendGridErrors.map(e => e.message || e.field || 'Unknown error');
        throw new Error(`SendGrid error: ${errorMessages.join('; ')}`);
      }

      throw error;
    }
  },
};


