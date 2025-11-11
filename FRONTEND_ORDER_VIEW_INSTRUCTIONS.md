# Frontend Order View Implementation Instructions

## Overview
The backend now supports token-based public access to orders. Customers can view their orders using a secure token from their email QR code, or by signing in to their account.

## Important: Base URL for QR Codes

**The frontend should provide the `baseUrl` when creating orders/payment intents.** This allows QR codes to use the correct URL based on environment:
- **Development:** `http://localhost:5173` (or your dev port)
- **Production:** `https://www.stagepasspro.com`

The backend will use this `baseUrl` when generating QR codes in emails. If not provided, it defaults to `https://www.stagepasspro.com`.

## API Endpoints

### 1. Get Order by ID (with token or authentication)
**Endpoint:** `GET /api/orders/:orderId?token={token}`

**Access Methods:**
- **Authenticated:** If user is logged in and owns the order (userId or sellerId matches), returns full order details
- **Token-based:** If `token` query parameter is provided and valid, returns limited public order details
- **Unauthorized:** Returns 401 if neither authentication nor valid token is provided

**Response Examples:**

**Authenticated (full access):**
```json
{
  "success": true,
  "order": {
    "id": "order123",
    "userId": "user456",
    "sellerId": "seller789",
    "status": "confirmed",
    "paymentStatus": "paid",
    "totalAmount": 6000,
    "paymentMethod": "card",
    "email": "customer@example.com",
    // ... all order fields
  },
  "accessLevel": "authenticated"
}
```

**Token-based (public access):**
```json
{
  "success": true,
  "order": {
    "id": "order123",
    "status": "confirmed",
    "paymentStatus": "paid",
    "productionId": "prod123",
    "performanceId": "perf456",
    "totalAmount": 6000,
    "createdAt": "2025-11-09T19:21:42.440Z",
    "tickets": [
      {
        "id": "ticket1",
        "section": "Orchestra",
        "row": "A",
        "seatNumber": "2",
        "price": 3000,
        "status": "valid",
        "qrCode": "QR_ticket1_1234567890"
      }
    ]
    // Note: Excludes userId, sellerId, paymentMethod, email, etc.
  },
  "accessLevel": "public",
  "message": "Sign in to view full order details and order history"
}
```

**Error Responses:**
- `401`: No authentication or token provided
- `403`: Invalid token or token expired
- `404`: Order not found

### 2. Public Order Endpoint (explicit)
**Endpoint:** `GET /api/orders/:orderId/public?token={token}`

Same as above but explicitly requires token. Returns same public order format.

## Frontend Implementation Steps

### Step 1: Order Detail Page Route
Create a route that handles both authenticated and token-based access:

```javascript
// Example route: /orders/:orderId
// URL examples:
// - /orders/abc123 (requires auth)
// - /orders/abc123?token=xyz789 (public access with token)
```

### Step 2: Extract Token from URL
```javascript
// Get token from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const orderId = router.params.orderId; // or however you get route params
```

### Step 3: Make API Call
```javascript
// Determine which endpoint to call
let apiUrl;
let headers = {};

if (token) {
  // Public access with token
  apiUrl = `/api/orders/${orderId}?token=${encodeURIComponent(token)}`;
} else if (isAuthenticated) {
  // Authenticated access
  apiUrl = `/api/orders/${orderId}`;
  headers = {
    'Authorization': `Bearer ${authToken}` // Your auth header format
  };
} else {
  // No token and not authenticated - show login prompt
  // Redirect to login or show login modal
}

// Make API call
const response = await fetch(apiUrl, { headers });
const data = await response.json();

if (!response.ok) {
  // Handle errors:
  // - 401: Show login prompt
  // - 403: Show "Invalid/expired token" message
  // - 404: Show "Order not found"
}
```

### Step 4: Handle Response Based on Access Level
```javascript
const { order, accessLevel, message } = data;

if (accessLevel === 'authenticated') {
  // Show full order details:
  // - All order fields
  // - Customer information
  // - Payment details
  // - Full ticket information
  // - Order history link
} else if (accessLevel === 'public') {
  // Show limited public view:
  // - Order status
  // - Event information (fetch from productionId/performanceId)
  // - Tickets with QR codes
  // - Total amount
  // - "Sign in for full details" prompt
  // - Do NOT show: userId, sellerId, paymentMethod, email, etc.
}
```

### Step 5: Display Different UI Based on Access

**Public View (token-based):**
- Show order confirmation
- Display event details (fetch production/performance data)
- Show tickets with QR codes
- Show total amount
- Display message: "Sign in to view full order details and order history"
- Add "Sign In" button/link

**Authenticated View:**
- Show all order details
- Show customer information
- Show payment method
- Show full receipt
- Show order history link
- Allow order management (cancel, etc.)

### Step 6: Handle Token Expiration
```javascript
if (response.status === 403 && data.error === 'Token has expired') {
  // Show message: "This link has expired. Please sign in to view your order."
  // Provide sign-in option
  // Optionally, if user is authenticated, automatically fetch with auth
}
```

### Step 7: Generate QR Codes for Tickets
The order response includes tickets, but you'll need to generate QR codes on the frontend:

```javascript
// QR code URL format: https://www.stagepasspro.com/orders/{orderId}?token={token}
const qrCodeUrl = `https://www.stagepasspro.com/orders/${orderId}?token=${token}`;

// Use a QR code library (e.g., qrcode.react, react-qr-code)
// Generate QR code image from qrCodeUrl
```

### Step 8: Fetch Additional Data
For public view, you'll need to fetch production/performance/venue data:

```javascript
// After getting order, fetch related data
if (order.productionId) {
  const production = await fetch(`/api/productions/${order.productionId}`);
}
if (order.performanceId) {
  const performance = await fetch(`/api/performances/${order.performanceId}`);
}
// Use this data to display event information
```

## Important Notes

1. **Token Security:**
   - Tokens are URL-safe (base64url encoded)
   - Tokens expire 2 years from order creation
   - Always validate token on backend (already done)

2. **Sensitive Data:**
   - Public view excludes: userId, sellerId, paymentMethod, email, billing info
   - Only show what's necessary for ticket viewing

3. **QR Codes:**
   - QR codes in emails contain: `https://www.stagepasspro.com/orders/{orderId}?token={token}`
   - When displaying tickets, generate QR codes with the same URL format

4. **User Experience:**
   - Encourage sign-in for better experience (non-intrusive)
   - Show clear messaging about access levels
   - Handle expired tokens gracefully

5. **Error Handling:**
   - 401: Prompt for login or show token input
   - 403: Show "Invalid/expired token" with sign-in option
   - 404: Show "Order not found"

## Example Component Structure

```javascript
// OrderDetailPage.jsx
function OrderDetailPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, isAuthenticated } = useAuth();
  const [order, setOrder] = useState(null);
  const [accessLevel, setAccessLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrder();
  }, [orderId, token, isAuthenticated]);

  const fetchOrder = async () => {
    try {
      let url = `/api/orders/${orderId}`;
      if (token) {
        url += `?token=${encodeURIComponent(token)}`;
      }
      
      const headers = {};
      if (isAuthenticated) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError('Please sign in or use the link from your order confirmation email');
        } else if (res.status === 403) {
          setError('This link has expired. Please sign in to view your order.');
        } else {
          setError(data.error || 'Failed to load order');
        }
        return;
      }

      setOrder(data.order);
      setAccessLevel(data.accessLevel);
    } catch (err) {
      setError('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!order) return <NotFound />;

  return (
    <div>
      {accessLevel === 'public' && (
        <PublicOrderView order={order} token={token} />
      )}
      {accessLevel === 'authenticated' && (
        <AuthenticatedOrderView order={order} />
      )}
    </div>
  );
}
```

## Base URL Configuration

### When Creating Orders
When calling `POST /api/orders`, include `baseUrl` in the request:

```javascript
const baseUrl = window.location.origin; // Automatically gets current origin
// In dev: "http://localhost:5173"
// In prod: "https://www.stagepasspro.com"

const orderData = {
  userId: "...",
  sellerId: "...",
  productionId: "...",
  performanceId: "...",
  totalAmount: 6000,
  baseUrl: baseUrl, // Include this!
  tickets: [...]
};

await fetch('/api/orders', {
  method: 'POST',
  body: JSON.stringify(orderData)
});
```

### When Creating Payment Intents
When calling `POST /api/payments/create-intent`, include `baseUrl`:

```javascript
const baseUrl = window.location.origin;

const paymentData = {
  theaterId: "...",
  amountCents: 6000,
  orderId: "...",
  baseUrl: baseUrl, // Include this!
  metadata: {
    orderId: "...",
    // baseUrl will be automatically added to metadata
  }
};

await fetch('/api/payments/create-intent', {
  method: 'POST',
  body: JSON.stringify(paymentData)
});
```

**Note:** The `baseUrl` from payment intent metadata will be stored in the order when payment succeeds, and used for QR code generation in emails.

## Testing

Test these scenarios:
1. ✅ Access with valid token (public view)
2. ✅ Access with expired token (403 error)
3. ✅ Access with invalid token (403 error)
4. ✅ Access without token when authenticated (full view)
5. ✅ Access without token when not authenticated (401 error)
6. ✅ Access as order owner (full view)
7. ✅ Access as seller (full view)
8. ✅ Access as different user (401 error)
9. ✅ QR codes use correct baseUrl (localhost in dev, production URL in prod)

## Questions?

If you need clarification on any part of the implementation, refer to:
- Backend code: `src/routes/orders.js` (lines 159-298)
- Email service: `src/services/email.js` (QR code generation with baseUrl)
- Webhook handler: `src/routes/webhooks.js` (token generation and baseUrl storage)
- Payment intent: `src/routes/payments.js` (baseUrl in metadata)

