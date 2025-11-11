const sgMail = require('@sendgrid/mail');
const QRCode = require('qrcode');
const { admin } = require('../firebase');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    if (process.env.SENDGRID_DATA_RESIDENCY === 'eu') {
      // Optional EU data residency
      sgMail.setDataResidency('eu');
    }
  } catch (err) {
  }
} else {
}

const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@example.com';
const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/stage-pass-b1d9b.firebasestorage.app/o/STAGE%20PASS%20LOGO.png?alt=media&token=6814dd6b-eeca-47dc-95e2-55159801a3eb';

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

// Build Welcome email template matching the design
function buildWelcomeTemplate({ name = "there" }) {
  // Format name for greeting - use first name if available, otherwise "there"
  const displayName = name && name !== "there" ? name.split(' ')[0] : "";
  const headingName = name && name !== "there" ? `, ${name.split(' ')[0]}` : "";
  
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
                  <p style="margin: 0 0 16px 0;">Hi${displayName ? ` ${displayName}` : ""},</p>

                  <p style="margin: 0 0 16px 0;">Welcome to <strong>StagePass Pro</strong> — we're thrilled to have you on board!</p>

                  <p style="margin: 0 0 16px 0;">StagePass Pro is built to help theaters like yours simplify ticketing, manage seat maps effortlessly, and keep every production running smoothly. You now have access to powerful tools that put full control of your venue in your hands — from customizable seating charts to real-time sales analytics.</p>

                  <h3 style="margin: 30px 0 15px 0; font-size: 18px; font-weight: bold; color: #000000;">Here's how to get started:</h3>

                  <ol style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8; color: #333333;">
                    <li style="margin-bottom: 8px;">Log in to your dashboard and set up your first production.</li>
                    <li style="margin-bottom: 8px;">Customize your seat map and pricing tiers.</li>
                    <li style="margin-bottom: 8px;">Start selling tickets and track performance in real time.</li>
                  </ol>

                  <p style="margin: 30px 0 16px 0;">If you ever need help, our support team is always here for you — just reach out to <a href="mailto:stagepasspro@gmail.com" style="color: #0066cc; text-decoration: none;">stagepasspro@gmail.com</a>.</p>

                  <p style="margin: 20px 0 16px 0; font-weight: bold; color: #000000;">Welcome to the future of theater ticketing.</p>

                  <p style="margin: 30px 0 0 0;"><strong>The StagePass Pro Team</strong></p>
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

async function sendGreetingEmail({ to, name, subject = 'Welcome to Stage Pass!' }) {
  const html = buildWelcomeTemplate({ name: name || "there" });

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject: subject || "Thanks for signing up!",
    text: `Hi ${name || "there"}, Thanks for signing up! Welcome to StagePass Pro.`,
    html
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    throw error;
  }
}

async function sendReceiptEmail({ to, subject = 'Your Stage Pass Receipt', order }) {
  const amount = order?.totalAmount != null ? (Number(order.totalAmount) / 100).toFixed(2) : '-';
  const orderId = order?.id || order?.orderId || 'Unknown';
  const lines = Array.isArray(order?.items) ? order.items : [];

  const itemsHtml = lines.length
    ? `<ul>${lines.map((l) => `<li>${l.name || 'Item'} — $${((Number(l.price)||0)/100).toFixed(2)} x ${l.quantity || 1}</li>`).join('')}</ul>`
    : '';

  const html = buildBasicHtmlWrapper(
    'Receipt',
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
    html
  };

  await sgMail.send(msg);
  return { success: true };
}

async function generateQrPngBuffer(data) {
  const buffer = await QRCode.toBuffer(String(data || ''), { 
    type: 'png', 
    margin: 2,
    scale: 10,
    errorCorrectionLevel: 'M'
  });
  return buffer;
}

/**
 * Upload QR code to Firebase Storage and return public URL
 * File structure: qr-codes/orders/{orderId}/{ticketId}.png
 */
async function uploadQrCodeToStorage(qrBuffer, orderId, ticketId) {
  try {
    const bucket = admin.storage().bucket();
    
    // Verify bucket exists
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) {
      throw new Error(`Storage bucket ${bucket.name} does not exist`);
    }
    
    const sanitizeId = (id) => String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = `qr-codes/orders/${sanitizeId(orderId)}/${sanitizeId(ticketId)}.png`;
    const file = bucket.file(filePath);
    
    
    await file.save(qrBuffer, {
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    
    // Try to make file publicly readable
    // Note: If uniform bucket-level access is enabled, this may fail silently
    try {
      await file.makePublic();
    } catch (aclError) {
    }
    
    // Use the simpler Google Cloud Storage URL format for public files
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return publicUrl;
  } catch (error) {

    if (error.code === 403 || error.message?.includes('Permission denied')) {
      throw new Error(`Permission denied uploading QR code. Check Firebase Admin SDK credentials and bucket permissions. Original: ${error.message}`);
    }
    if (error.code === 404 || error.message?.includes('not found')) {
      throw new Error(`Storage bucket not found. Check FIREBASE_STORAGE_BUCKET environment variable. Original: ${error.message}`);
    }
    
    throw new Error(`Failed to upload QR code to storage: ${error.message}`);
  }
}

async function sendTicketEmail({
  to,
  subject = 'Your Stage Pass Ticket',
  ticket,
  order,
  performance,
  venue,
  qrContent
}) {
  const ticketId = ticket?.id || 'Ticket';
  const showName = performance?.productionName || performance?.title || order?.productionName || 'Performance';
  
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
  
  const venueName = venue?.name || performance?.venueName || '';
  
  // Format seating: Section and Seat (combining row and seatNumber)
  const section = ticket?.section || 'General';
  const seat = ticket?.row && ticket?.seatNumber 
    ? `${ticket.row}${ticket.seatNumber}` 
    : ticket?.seatNumber || ticket?.row || '';

  const qrData = qrContent || ticket?.qrCode || `${ticketId}`;
  const orderId = order?.id || order?.orderId || 'unknown';
  
  // Generate QR code and upload to Firebase Storage
  let qrImageUrl;
  try {
    const qrBuffer = await generateQrPngBuffer(qrData);
    qrImageUrl = await uploadQrCodeToStorage(qrBuffer, orderId, ticketId);
  } catch (error) {
    throw error;
  }

  const body = `
    <p>Here are your ticket details:</p>
    <p><strong>Event:</strong> ${showName}</p>
    ${formattedWhen ? `<p><strong>When:</strong> ${formattedWhen}</p>` : ''}
    ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ''}
    <p><strong>Section:</strong> ${section}</p>
    ${seat ? `<p><strong>Seat:</strong> ${seat}</p>` : ''}
    <p>Present this QR code at the venue:</p>
    <img src="${qrImageUrl}" alt="Ticket QR" style="width:200px;height:200px;" />
  `;

  const html = buildBasicHtmlWrapper('Your Ticket', body);

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Ticket for ${showName}${formattedWhen ? ` on ${formattedWhen}` : ''}`,
    html
  };

  await sgMail.send(msg);
  return { success: true };
}

module.exports = {
  sendGreetingEmail,
  sendReceiptEmail,
  sendTicketEmail,
  sendTicketsEmail: async function sendTicketsEmail({ to, subject = 'Your Stage Pass Tickets', order, tickets = [], performance, venue }) {
    const showName = performance?.productionName || performance?.title || order?.productionName || 'Performance';
    
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
    
    const venueName = venue?.name || performance?.venueName || '';

    // Generate QR codes and upload to Firebase Storage
    const orderId = order?.id || order?.orderId || 'unknown';
    const listItems = [];
    let idx = 0;
    
    for (const ticket of tickets) {
      const qrData = ticket?.qrCode || ticket?.id || String(idx + 1);
      
      let qrImageUrl = null;
      try {
        const qrBuffer = await generateQrPngBuffer(qrData);
        const ticketIdForStorage = ticket?.id || `ticket-${idx}`;
        qrImageUrl = await uploadQrCodeToStorage(qrBuffer, orderId, ticketIdForStorage);
      } catch (error) {
      }
      
      // Format seating: Section and Seat (combining row and seatNumber)
      const section = ticket?.section || 'General';
      const seat = ticket?.row && ticket?.seatNumber 
        ? `${ticket.row}${ticket.seatNumber}` 
        : ticket?.seatNumber || ticket?.row || '';
      const seatDisplay = seat ? `Section: ${section}, Seat: ${seat}` : `Section: ${section}`;
      
      const qrImg = qrImageUrl 
        ? `<img src="${qrImageUrl}" alt="Ticket QR" style="width:160px;height:160px;margin:8px 0;"/>`
        : '<div style="width:160px;height:160px;background-color:#f0f0f0;border:1px solid #ddd;margin:8px 0;"></div>';
      listItems.push(`<li><div><strong>${seatDisplay || ticket?.id || `Ticket ${idx+1}`}</strong></div>${qrImg}</li>`);
      idx += 1;
    }

    const listHtml = listItems.length ? `<ol>${listItems.join('')}</ol>` : '<p>No tickets found.</p>';
    const body = `
      <p>Here are your tickets:</p>
      <p><strong>Event:</strong> ${showName}</p>
      ${formattedWhen ? `<p><strong>When:</strong> ${formattedWhen}</p>` : ''}
      ${venueName ? `<p><strong>Venue:</strong> ${venueName}</p>` : ''}
      ${listHtml}
    `;

    const html = buildBasicHtmlWrapper('Your Tickets', body);

    const msg = {
      to,
      from: DEFAULT_FROM_EMAIL,
      subject,
      text: `Tickets for ${showName}${showTime ? ` on ${showTime}` : ''}`,
      html
    };

    await sgMail.send(msg);
    return { success: true };
  }
};


