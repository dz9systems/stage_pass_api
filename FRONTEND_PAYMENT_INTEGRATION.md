# Frontend Payment Integration Guide

This guide shows exactly what data to send from the frontend when creating a PaymentIntent.

## Payment Intent Endpoint

**POST** `/api/payments/create-intent`

## Request Payload

Send the following data in the request body:

```javascript
{
  // Required fields
  sellerId: "seller-user-id",           // The seller user ID (NOT theaterId)
  amountCents: 5000,                     // Amount in cents (e.g., $50.00 = 5000)
  
  // Optional but recommended
  orderId: "existing-order-id",          // If order already exists, otherwise webhook will create it
  baseUrl: "https://www.stagepasspro.com", // Frontend URL (use localhost:5173 in dev)
  
  // Order/Event Information
  productionId: "production-id",
  performanceId: "performance-id",
  customerEmail: "customer@example.com",
  
  // Venue/Location Information (sent from frontend - separate fields)
  venueName: "Theater Name",
  venueAddress: "123 Main St",
  venueCity: "New York",
  venueState: "NY",
  venueZipCode: "10001",
  
  // Performance Date/Time (sent from frontend)
  performanceDate: "2025-01-15",         // ISO date string (YYYY-MM-DD)
  performanceTime: "19:00",              // Time string (24-hour format HH:mm)
  
  // Alternative: Send everything in metadata object
  metadata: {
    sellerId: "seller-user-id",          // Only sellerId - no userId or theaterId
    orderId: "existing-order-id",
    productionId: "production-id",
    performanceId: "performance-id",
    customerEmail: "customer@example.com",
    baseUrl: "https://www.stagepasspro.com",
    venueName: "Theater Name",
    venueAddress: "123 Main St",
    venueCity: "New York",
    venueState: "NY",
    venueZipCode: "10001",
    performanceDate: "2025-01-15",
    performanceTime: "19:00"
  }
}
```

**Note:** Tickets are created via the order creation endpoint (`POST /api/orders`), not through the payment intent. The webhook will create the order with venue and date information, but tickets should be created separately when the order is created.

## Example Frontend Code

### React/TypeScript Example

```typescript
interface Ticket {
  seatId?: string;
  section: string;
  row: string;
  seatNumber: string;
  price: number; // in cents
}

interface PaymentIntentRequest {
  sellerId: string;  // Frontend sends sellerId (not theaterId)
  amountCents: number;
  orderId?: string;
  baseUrl: string;
  productionId: string;
  performanceId: string;
  customerEmail: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueState: string;
  venueZipCode: string;
  performanceDate: string;  // Changed from eventDate
  performanceTime: string;  // Changed from eventTime
}

async function createPaymentIntent(data: PaymentIntentRequest) {
  const response = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sellerId: data.sellerId,  // Frontend sends sellerId
      amountCents: data.amountCents,
      baseUrl: data.baseUrl, // e.g., window.location.origin
      productionId: data.productionId,
      performanceId: data.performanceId,
      customerEmail: data.customerEmail,
      venueName: data.venueName,
      venueAddress: data.venueAddress,
      venueCity: data.venueCity,
      venueState: data.venueState,
      venueZipCode: data.venueZipCode,
      performanceDate: data.performanceDate,
      performanceTime: data.performanceTime,
      // Optional: include orderId if order was created before payment
      orderId: data.orderId,
    }),
  });

  const result = await response.json();
  return result;
}

// Usage
const paymentData = {
  sellerId: currentUser.id,  // Frontend sends sellerId
  amountCents: totalAmount,
  baseUrl: import.meta.env.DEV 
    ? 'http://localhost:5173' 
    : 'https://www.stagepasspro.com',
  productionId: production.id,
  performanceId: performance.id,
  customerEmail: customerEmail,
  venueName: venue.name,
  venueAddress: venue.address,
  venueCity: venue.city,
  venueState: venue.state,
  venueZipCode: venue.zipCode,
  performanceDate: performance.date, // Format: YYYY-MM-DD
  performanceTime: performance.startTime, // Format: HH:mm
  // Optional: include orderId if order was created before payment
  orderId: orderId,
};

const paymentIntent = await createPaymentIntent(paymentData);
```

### JavaScript Example

```javascript
async function createPaymentIntent(paymentData) {
  const response = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      theaterId: paymentData.theaterId,
      amountCents: paymentData.amountCents,
      baseUrl: paymentData.baseUrl || window.location.origin,
      productionId: paymentData.productionId,
      performanceId: paymentData.performanceId,
      customerEmail: paymentData.customerEmail,
      venueName: paymentData.venueName,
      venueAddress: paymentData.venueAddress,
      eventDate: paymentData.eventDate,
      eventTime: paymentData.eventTime,
      tickets: paymentData.tickets,
    }),
  });

  return await response.json();
}

// Example usage
const paymentData = {
  sellerId: 'seller-123',  // Frontend sends sellerId
  amountCents: 10000, // $100.00
  baseUrl: 'https://www.stagepasspro.com',
  productionId: 'prod-123',
  performanceId: 'perf-456',
  customerEmail: 'buyer@example.com',
  venueName: 'Grand Theater',
  venueAddress: '123 Broadway',
  venueCity: 'New York',
  venueState: 'NY',
  venueZipCode: '10001',
  performanceDate: '2025-01-15',
  performanceTime: '19:00'
};

createPaymentIntent(paymentData)
  .then(result => {
    console.log('PaymentIntent created:', result);
    // Use result.clientSecret with Stripe.js
  })
  .catch(error => {
    console.error('Error creating PaymentIntent:', error);
  });
```

## What Happens Next

1. **PaymentIntent Created**: The backend creates a Stripe PaymentIntent with all metadata
2. **Payment Processed**: Customer completes payment via Stripe
3. **Webhook Triggered**: When payment succeeds, the webhook:
   - Creates order (if orderId was missing)
   - Creates tickets subcollection with QR codes
   - Stores venue and date information
   - Sends confirmation email with tickets

## Important Notes

### Base URL
- **Development**: Use `http://localhost:5173` (or your dev server URL)
- **Production**: Use `https://www.stagepasspro.com`
- This is used to generate QR code URLs in emails

### Venue Fields
- Send separate fields: `venueName`, `venueAddress`, `venueCity`, `venueState`, `venueZipCode`
- Backend will combine them into a full address if needed

### Date/Time Format
- `performanceDate`: ISO date string (YYYY-MM-DD)
- `performanceTime`: 24-hour format (HH:mm)

### Tickets
- **Tickets are NOT sent in payment intent metadata**
- Tickets are created separately via the order creation endpoint (`POST /api/orders`)
- The webhook creates the order with venue and date information, but tickets should be created when the order is created

### Order ID
- If you create the order before payment, include `orderId`
- If you don't include `orderId`, the webhook will create the order automatically
- When webhook creates order, it will use all the metadata you send

## Response Format

```javascript
{
  clientSecret: "pi_xxx_secret_xxx",  // Use with Stripe.js
  paymentIntentId: "pi_xxx",
  // ... other Stripe PaymentIntent fields
}
```

## Complete Flow Example

```javascript
// 1. Prepare payment data
const paymentData = {
  sellerId: sellerId,  // Frontend sends sellerId
  amountCents: totalAmount,
  baseUrl: window.location.origin,
  productionId: production.id,
  performanceId: performance.id,
  customerEmail: customerEmail,
  venueName: venue.name,
  venueAddress: venue.address,
  venueCity: venue.city,
  venueState: venue.state,
  venueZipCode: venue.zipCode,
  performanceDate: performance.date,
  performanceTime: performance.startTime
};

// 3. Create PaymentIntent
const { clientSecret } = await createPaymentIntent(paymentData);

// 4. Use Stripe.js to confirm payment
const stripe = Stripe('pk_test_...');
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      email: customerEmail,
    },
  },
});

if (error) {
  console.error('Payment failed:', error);
} else {
  console.log('Payment succeeded! Webhook will create order and send emails.');
}
```

---

**Questions?** Check the webhook logs to see what data is being received and processed.

