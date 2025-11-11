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
    console.error('Failed to initialize SendGrid:', err.message);
  }
} else {
  console.warn('SENDGRID_API_KEY is not set. Emails will fail to send.');
}

const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@example.com';

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

async function sendGreetingEmail({ to, name, subject = 'Welcome to Stage Pass!' }) {
  const html = buildBasicHtmlWrapper(
    'Welcome',
    `<p>Hi ${name || 'there'},</p>
     <p>Welcome to Stage Pass. We're excited to have you!</p>`
  );

  const msg = {
    to,
    from: DEFAULT_FROM_EMAIL,
    subject,
    text: `Hi ${name || 'there'}, Welcome to Stage Pass!`,
    html
  };

  await sgMail.send(msg);
  return { success: true };
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
    
    console.log('📤 [Email] Uploading QR code to storage:', { filePath, bucket: bucket.name });
    
    await file.save(qrBuffer, {
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    console.log('🔓 [Email] Making QR code file public...');
    
    // Try to make file publicly readable
    // Note: If uniform bucket-level access is enabled, this may fail silently
    try {
      await file.makePublic();
      console.log('✅ [Email] File ACL set to public');
    } catch (aclError) {
      console.log('⚠️ [Email] Could not set file ACL (uniform bucket-level access may be enabled):', aclError.message);
      console.log('ℹ️ [Email] Relying on storage rules for public access');
    }
    
    // Use the simpler Google Cloud Storage URL format for public files
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log('✅ [Email] QR code uploaded to storage:', { filePath, publicUrl });
    return publicUrl;
  } catch (error) {
    console.error('❌ [Email] Failed to upload QR code to storage:', {
      message: error.message,
      code: error.code,
      details: error.details || error.response || error
    });
    
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
    console.error('❌ [Email] Failed to generate/upload QR code:', error.message);
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
      console.log(`🎫 [Email] Generating QR code for ticket ${idx + 1}:`, { ticketId: ticket?.id, qrCode: ticket?.qrCode, qrData });
      
      let qrImageUrl = null;
      try {
        const qrBuffer = await generateQrPngBuffer(qrData);
        const ticketIdForStorage = ticket?.id || `ticket-${idx}`;
        qrImageUrl = await uploadQrCodeToStorage(qrBuffer, orderId, ticketIdForStorage);
      } catch (error) {
        console.error(`❌ [Email] Failed to generate/upload QR code for ticket ${idx + 1}:`, error.message);
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
    console.log(`📎 [Email] Prepared ${listItems.length} tickets with QR codes`);

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


