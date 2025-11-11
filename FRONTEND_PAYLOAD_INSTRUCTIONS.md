# Frontend Payload Instructions

## Standardized Payload Structure

Use the **same payload structure** for both:
1. **Order Creation** (`POST /api/orders`)
2. **Payment Intent Creation** (`POST /api/payments/create-intent`)

This ensures consistency and prevents data mismatches.

---

## Complete Payload Structure

### Required Fields

```javascript
{
  // REQUIRED - Core Order Data
  sellerId: "user-id-123",              // The seller/theater user ID (NOT email)
  productionId: "production-id-456",    // Production/Show ID
  performanceId: "performance-id-789",  // Performance/Event ID
  totalAmount: 12500,                    // Total amount in CENTS (e.g., $125.00 = 12500)
  customerEmail: "customer@example.com", // Customer's email address
  
  // REQUIRED - Venue Information (send from frontend)
  venueName: "New Conservatory Theatre",
  venueAddress: "25 Van Ness Avenue at Market Street",
  venueCity: "San Francisco",
  venueState: "CA",
  venueZipCode: "94102",
  
  // REQUIRED - Performance Date/Time (send from frontend)
  performanceDate: "2025-11-05",        // ISO date format: YYYY-MM-DD
  performanceTime: "18:31",             // 24-hour time format: HH:mm (e.g., "18:31" for 6:31 PM)
  
  // REQUIRED - Base URL for QR codes
  baseUrl: "http://localhost:5173",     // Use localhost in dev, production URL in prod
  
  // REQUIRED - Tickets Array
  tickets: [
    {
      section: "A",
      row: "1",
      seatNumber: "5",
      price: 5000,                       // Price in CENTS for this ticket
      seatId: "optional-seat-id"        // Optional: seat identifier
    },
    {
      section: "A",
      row: "1",
      seatNumber: "6",
      price: 5000
    }
    // ... more tickets
  ]
}
```

### Optional Fields

```javascript
{
  // Optional - Order Status (defaults to 'pending')
  status: "pending",                    // 'pending' | 'completed' | 'canceled' | 'refunded'
  paymentStatus: "pending",             // 'pending' | 'paid' | 'refunded' | 'failed'
  paymentMethod: "card",                // Payment method used
  
  // Optional - If order already exists
  orderId: "existing-order-id"          // Only include if order was created before payment
}
```

---

## Endpoint-Specific Notes

### 1. Order Creation (`POST /api/orders`)

**What happens:**
- Creates order document in Firestore
- Stores all venue and performance data on the order
- Returns order with `orderId`

**Payload:** Use the complete structure above

**Response:**
```javascript
{
  success: true,
  order: {
    id: "order-id-123",
    sellerId: "...",
    productionId: "...",
    // ... all order fields
  }
}
```

### 2. Payment Intent Creation (`POST /api/payments/create-intent`)

**What happens:**
- Creates Stripe PaymentIntent
- Stores all data in PaymentIntent metadata
- If `orderId` is missing, webhook will create order from metadata

**Payload:** Use the complete structure above

**Important:** 
- If you create order first, include `orderId` in the payload
- If you don't include `orderId`, webhook will create order automatically
- Tickets array will be stringified for Stripe metadata (handled by backend)

**Response:**
```javascript
{
  clientSecret: "pi_xxx_secret_xxx",  // Use with Stripe.js
  paymentIntentId: "pi_xxx"
}
```

---

## Date/Time Format Requirements

### Performance Date
- **Format:** `YYYY-MM-DD` (ISO date string)
- **Example:** `"2025-11-05"` for November 5, 2025
- **NOT:** `"Wednesday, November 5, 2025"` ❌
- **NOT:** `"11/05/2025"` ❌

### Performance Time
- **Format:** `HH:mm` (24-hour format)
- **Example:** `"18:31"` for 6:31 PM
- **Example:** `"19:00"` for 7:00 PM
- **NOT:** `"6:31 PM"` ❌
- **NOT:** `"6:31pm"` ❌

**Frontend Conversion Example:**
```javascript
// If you have a Date object or formatted string
const performanceDate = new Date(performance.startTime);
const formattedDate = performanceDate.toISOString().split('T')[0]; // "2025-11-05"

// If you have time like "6:31 PM"
const timeString = "6:31 PM";
const [time, period] = timeString.split(' ');
const [hours, minutes] = time.split(':');
const hour24 = period === 'PM' && hours !== '12' 
  ? parseInt(hours) + 12 
  : period === 'AM' && hours === '12' 
    ? 0 
    : parseInt(hours);
const formattedTime = `${hour24.toString().padStart(2, '0')}:${minutes}`; // "18:31"
```

---

## Complete Example

### TypeScript Interface

```typescript
interface Ticket {
  section: string;
  row: string;
  seatNumber: string;
  price: number;        // in cents
  seatId?: string;      // optional
}

interface OrderPayload {
  // Required
  sellerId: string;
  productionId: string;
  performanceId: string;
  totalAmount: number;  // in cents
  customerEmail: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueState: string;
  venueZipCode: string;
  performanceDate: string;  // YYYY-MM-DD
  performanceTime: string;  // HH:mm
  baseUrl: string;
  tickets: Ticket[];
  
  // Optional
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  orderId?: string;
}
```

### JavaScript Example

```javascript
// Prepare order/payment data
const orderData = {
  // Core data
  sellerId: currentUser.id,
  productionId: production.id,
  performanceId: performance.id,
  totalAmount: selectedTickets.reduce((sum, t) => sum + t.price, 0),
  customerEmail: customerEmail,
  
  // Venue data (from venue object or performance)
  venueName: venue.name || performance.venueName,
  venueAddress: venue.address || "",
  venueCity: venue.city || "",
  venueState: venue.state || "",
  venueZipCode: venue.zipCode || "",
  
  // Performance date/time (convert to required format)
  performanceDate: formatDateToISO(performance.date),  // Convert to YYYY-MM-DD
  performanceTime: formatTimeTo24Hour(performance.startTime),  // Convert to HH:mm
  
  // Base URL
  baseUrl: import.meta.env.DEV 
    ? 'http://localhost:5173' 
    : 'https://www.stagepasspro.com',
  
  // Tickets
  tickets: selectedTickets.map(ticket => ({
    section: ticket.section,
    row: ticket.row,
    seatNumber: ticket.seatNumber,
    price: ticket.price,  // already in cents
    seatId: ticket.seatId  // optional
  }))
};

// Create order first
const orderResponse = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(orderData)
});
const { order } = await orderResponse.json();

// Then create payment intent with orderId
const paymentData = {
  ...orderData,
  orderId: order.id  // Include orderId from created order
};

const paymentResponse = await fetch('/api/payments/create-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(paymentData)
});
const { clientSecret } = await paymentResponse.json();

// Use clientSecret with Stripe.js
```

---

## Helper Functions

```javascript
// Convert date to YYYY-MM-DD format
function formatDateToISO(date) {
  if (typeof date === 'string') {
    // If already in ISO format, return as-is
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return date;
    }
    // Otherwise parse and format
    return new Date(date).toISOString().split('T')[0];
  }
  // If Date object
  return date.toISOString().split('T')[0];
}

// Convert time to HH:mm format (24-hour)
function formatTimeTo24Hour(time) {
  if (typeof time === 'string') {
    // If already in HH:mm format, return as-is
    if (time.match(/^\d{2}:\d{2}$/)) {
      return time;
    }
    // If in "6:31 PM" format
    const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2];
      const period = match[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
  }
  // If Date object, extract time
  if (time instanceof Date) {
    return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
  }
  return time;
}
```

---

## Important Notes

1. **Always send `sellerId`** - Required for both endpoints
2. **Always send `customerEmail`** - Required for email delivery
3. **Always send venue fields** - Even if you have venueId, send the fields for email template
4. **Always send performance date/time** - Send in correct format (YYYY-MM-DD and HH:mm)
5. **Tickets array** - Send ticket objects with `section`, `row`, `seatNumber`, `price`
6. **Amounts in cents** - All prices and amounts must be in cents (multiply dollars by 100)

---

## Backend Storage

The backend will:
- Store venue fields on order: `venueName`, `venueAddress`, `venueCity`, `venueState`, `venueZipCode`
- Store performance date/time on order: `performanceDate`, `performanceTime`
- Use this data for email templates when venue/performance objects aren't available
- Create tickets subcollection when tickets array is provided

---

## Questions?

If you're unsure about any field:
1. Check the payload structure above
2. Ensure date/time are in correct format
3. Ensure amounts are in cents
4. Always include `sellerId` and `customerEmail`


