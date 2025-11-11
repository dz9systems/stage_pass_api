# Testing Email Webhook with Postman

## Prerequisites

1. **An existing order in your database** - The webhook needs a valid `orderId` that exists in your orders collection
2. **SendGrid configured** - Make sure `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set in your environment

## Method 1: Simulate Webhook Event (Easiest)

Since you're in development mode, the webhook will accept unverified events.

### Postman Setup

1. **Method**: `POST`
2. **URL**: `http://localhost:4242/webhooks/stripe`
3. **Headers**:
   - `Content-Type: application/json`
   - (No `stripe-signature` header needed in dev mode)

4. **Body** (raw JSON):
```json
{
  "id": "evt_test_1234567890",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_test_1234567890",
      "object": "payment_intent",
      "amount": 5000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "orderId": "YOUR_ORDER_ID_HERE",
        "customerEmail": "test@example.com",
        "baseUrl": "http://localhost:5173"
      },
      "customer": null
    }
  }
}
```

### Replace These Values:
- `YOUR_ORDER_ID_HERE` - Replace with an actual order ID from your database
- `test@example.com` - Replace with the email address you want to test
- `http://localhost:5173` - Replace with your frontend URL (for QR codes)

### What Happens:
1. Webhook receives the event
2. Looks up the order by `orderId`
3. Determines recipient email (uses `customerEmail` from metadata first)
4. Fetches tickets for the order
5. Generates QR codes for each ticket
6. Sends email via SendGrid

## Method 2: Use Stripe CLI (More Realistic)

If you want to test with real Stripe events:

1. **Install Stripe CLI**: https://stripe.com/docs/stripe-cli
2. **Login**: `stripe login`
3. **Forward webhooks**: `stripe listen --forward-to localhost:4242/webhooks/stripe`
4. **Trigger test event**: `stripe trigger payment_intent.succeeded`

But you'll need to:
- Create a real PaymentIntent with metadata first
- Or modify the triggered event to include your orderId

## Method 3: Create Order + Payment Intent (Full Flow)

### Step 1: Create an Order
**POST** `http://localhost:4242/api/orders`

```json
{
  "userId": "user_id_here",
  "sellerId": "seller_id_here",
  "productionId": "production_id_here",
  "performanceId": "performance_id_here",
  "totalAmount": 5000,
  "customerEmail": "test@example.com",
  "baseUrl": "http://localhost:5173",
  "tickets": [
    {
      "section": "A",
      "row": "1",
      "seatNumber": "5",
      "price": 5000
    }
  ]
}
```

### Step 2: Create Payment Intent with Order ID
**POST** `http://localhost:4242/api/payments/create-intent`

```json
{
  "theaterId": "seller_id_here",
  "amountCents": 5000,
  "orderId": "ORDER_ID_FROM_STEP_1",
  "baseUrl": "http://localhost:5173",
  "metadata": {
    "orderId": "ORDER_ID_FROM_STEP_1",
    "customerEmail": "test@example.com"
  }
}
```

### Step 3: Simulate Payment Success Webhook
Use Method 1 above with the orderId from Step 1.

## Troubleshooting

### Check Logs
Watch your server console for:
- `📧 [Email] Attempting to send email to: ...` - Email sending started
- `✅ [Email] Order Summary email sent successfully` - Success!
- `❌ [Email] Failed to send...` - Check the error message

### Common Issues

1. **"Order not found"**
   - Make sure the `orderId` in the webhook payload exists in your database

2. **"No recipient email found"**
   - Ensure `customerEmail` is in metadata, or the order has `customerEmail`/`email` field

3. **"SENDGRID_API_KEY is not set"**
   - Check your `.env` file has `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`

4. **"FROM email is not verified in SendGrid"**
   - Verify your sender email in SendGrid dashboard

5. **"Failed to generate QR code"**
   - Check that `baseUrl` is set correctly in metadata

## Quick Test Payload

Here's a minimal test payload (replace `YOUR_ORDER_ID`):

```json
{
  "id": "evt_test_webhook",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_test_webhook",
      "status": "succeeded",
      "amount": 5000,
      "currency": "usd",
      "metadata": {
        "orderId": "YOUR_ORDER_ID",
        "customerEmail": "your-email@example.com"
      }
    }
  }
}
```

Send this to `POST http://localhost:4242/webhooks/stripe` and check your email inbox!



