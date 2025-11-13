# Testing Welcome Email with Postman

## Quick Test Guide

The welcome email is automatically sent when you create a new user via `POST /api/users`. Here's how to test it:

## Method 1: Using Postman Collection (Recommended)

### Step 1: Import Postman Collection
1. Open Postman
2. Click **Import**
3. Select `postman/postman.json` or `Stage_Pass_API.postman_collection.json`

### Step 2: Set Environment Variables
1. Click the **Environments** tab (or gear icon)
2. Create a new environment or use the default
3. Set the following variable:
   - `api_base_url`: `http://localhost:4242` (or your server URL)

### Step 3: Test User Creation
1. Navigate to **Users API** → **CREATE** → **CREATE USER**
2. The request is already configured, but update the body with your test email:

```json
{
  "displayName": "Test User",
  "email": "your-email@example.com",
  "role": "customer"
}
```

3. Click **Send**

### Step 4: Verify
- **Response**: You should get a `201 Created` with the user object
- **Email**: Check the inbox for `your-email@example.com` for the welcome email
- **Server Logs**: Check your server console for any email errors

## Method 2: Manual Postman Request

### Request Setup

**Method:** `POST`

**URL:** `http://localhost:4242/api/users`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "displayName": "John Doe",
  "email": "john.doe@example.com",
  "role": "customer",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001"
}
```

### Minimal Test (Required Fields Only)
```json
{
  "displayName": "Jane Smith",
  "email": "jane.smith@example.com"
}
```

Note: `role` defaults to `"customer"` if not provided.

## Expected Response

**Success (201 Created):**
```json
{
  "success": true,
  "user": {
    "id": "generated-user-id",
    "displayName": "John Doe",
    "email": "john.doe@example.com",
    "role": "customer",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    ...
  }
}
```

**Error (400 Bad Request):**
```json
{
  "error": "displayName and email are required"
}
```

## What Happens Behind the Scenes

1. ✅ User is created in Firestore
2. ✅ Welcome email is triggered automatically (asynchronously)
3. ✅ API responds immediately (doesn't wait for email)
4. ✅ Email is sent via SendGrid to the user's email address

## Verifying Email Was Sent

### Check Server Logs
Look for these messages in your server console:

**Success:**
- No error messages (email sent successfully)

**Failure:**
- `Failed to send welcome email: [error message]`
- Check the error message for details

### Check Your Email Inbox
- Check the inbox for the email address you used
- Subject: "Welcome to Stage Pass Pro!"
- Should include:
  - Stage Pass logo
  - "Thanks for signing up, [Name]!"
  - Welcome message
  - Getting started steps
  - Support email link

### Check SendGrid Dashboard
1. Log into your SendGrid account
2. Go to **Activity** → **Email Activity**
3. Look for the email sent to your test address
4. Check status (Delivered, Bounced, etc.)

## Troubleshooting

### Email Not Received?

1. **Check SendGrid Configuration**
   - Verify `SENDGRID_API_KEY` is set in your `.env` file
   - Verify `SENDGRID_FROM_EMAIL` is set and verified in SendGrid
   - Check SendGrid dashboard for delivery status

2. **Check Server Logs**
   - Look for error messages about email sending
   - Common errors:
     - `SENDGRID_API_KEY is not set`
     - `FROM email is not verified in SendGrid`
     - `Invalid 'to' email address`

3. **Check Spam Folder**
   - Welcome emails sometimes end up in spam
   - Check your spam/junk folder

4. **Verify Email Address**
   - Make sure the email address in the request is valid
   - Test with a real email address you have access to

### User Created But Email Failed?

This is expected behavior! The email is sent asynchronously, so:
- ✅ User creation will succeed even if email fails
- ⚠️ Email errors are logged but don't block the response
- Check server logs to see why email failed

### Common Errors

**"displayName and email are required"**
- Make sure both `displayName` and `email` are in the request body

**"role must be either 'customer', 'seller', or 'admin'"**
- Use one of these three roles only

**"Failed to send welcome email: FROM email is not verified"**
- Verify your sender email in SendGrid dashboard
- Go to Settings → Sender Authentication → Verify your email

**"Failed to send welcome email: Invalid 'to' email address"**
- Check that the email address is properly formatted
- Make sure it's a valid email address

## Testing Different Scenarios

### Test with Different Roles
```json
{
  "displayName": "Theater Owner",
  "email": "owner@theater.com",
  "role": "seller"
}
```

### Test with Full User Data
```json
{
  "displayName": "Complete User",
  "email": "complete@example.com",
  "photoURL": "https://example.com/photo.jpg",
  "role": "customer",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001"
}
```

### Test with Different Names
The email will use the first name in the greeting:
- `"displayName": "John Doe"` → "Hi John,"
- `"displayName": "Jane"` → "Hi Jane,"
- `"displayName": "Mary Jane Watson"` → "Hi Mary,"

## Quick Test Checklist

- [ ] Server is running on `http://localhost:4242`
- [ ] SendGrid API key is configured in `.env`
- [ ] SendGrid FROM email is verified
- [ ] Postman request is configured correctly
- [ ] Test email address is valid and accessible
- [ ] Check server logs for errors
- [ ] Check email inbox (and spam folder)
- [ ] Verify email content matches design

## Example cURL Command

If you prefer command line:

```bash
curl -X POST http://localhost:4242/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Test User",
    "email": "test@example.com",
    "role": "customer"
  }'
```

Replace `test@example.com` with your actual email address.




