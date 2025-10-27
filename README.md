# Stage Pass API

A comprehensive backend API for managing theater productions, venues, orders, and Stripe Connect integration. This API provides complete CRUD operations for all theater-related entities along with Stripe payment processing and account management.

## Table of Contents

- [Overview](#overview)
- [Environment Setup](#environment-setup)
- [Installation](#installation)
- [API Endpoints](#api-endpoints)
  - [CRUD API Routes](#crud-api-routes)
    - [Users API](#users-api)
    - [Productions API](#productions-api)
    - [Performances API](#performances-api)
    - [Venues API](#venues-api)
    - [Seatmaps API](#seatmaps-api)
    - [Orders API](#orders-api)
    - [Tickets API](#tickets-api)
  - [Connect Express Routes](#connect-express-routes)
  - [Connect Standard Routes](#connect-standard-routes)
  - [Payment Routes](#payment-routes)
  - [Webhook Routes](#webhook-routes)
  - [Dashboard/Stripe Data Routes](#dashboardstripe-data-routes)
- [Data Models](#data-models)
- [Error Handling](#error-handling)

## Overview

The Stage Pass API is built with Node.js and Express, integrating with Stripe for payment processing and account management. It supports both Express and Standard Stripe Connect accounts, allowing theaters to process payments directly to their accounts.

### Key Features

- **Complete CRUD Operations**: Full Create, Read, Update, Delete functionality for all entities
- **Theater Management**: Users, productions, performances, venues, seatmaps, orders, and tickets
- **Stripe Connect Integration**: Support for both Express and Standard account types
- **Payment Processing**: Direct charge processing to connected accounts
- **Dashboard Analytics**: Comprehensive data retrieval for accounts, payments, products, and customers
- **Webhook Handling**: Secure webhook processing for Stripe events
- **Data Relationships**: Proper parent-child relationships between entities
- **Filtering & Pagination**: Advanced query capabilities for all list endpoints

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Configuration
FIREBASE_PROJECT_ID=stage-pass-b1d9b
FIREBASE_DATABASE_URL=https://stage-pass-b1d9b-default-rtdb.firebaseio.com/
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"stage-pass-b1d9b",...}
# OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Application URLs
API_BASE_URL=http://localhost:4242
APP_BASE_URL=http://localhost:5173

# Server Configuration
PORT=4242
```

### Firebase Setup

1. **Create a Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use an existing one
   - Enable Firestore Database
   - Enable Authentication (optional, for user management)

2. **Get Service Account Key:**
   - Go to Project Settings > Service Accounts
   - Generate a new private key
   - Download the JSON file and set the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable

3. **Deploy Firestore Rules and Indexes:**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

4. **Deploy Firebase Functions (optional):**
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The server will start on port 4242 (or the port specified in your environment variables).

## API Endpoints

### CRUD API Routes

The Stage Pass API provides comprehensive CRUD operations for all theater-related entities. All endpoints support filtering, pagination, and proper error handling.

#### Users API

Base URL: `/api/users`

Manage user accounts for both customers and sellers.

**Endpoints:**
- `POST /` - Create a new user
- `GET /` - Get all users (with filtering by role, pagination)
- `GET /:userId` - Get user by ID
- `PUT /:userId` - Update user (full update)
- `PATCH /:userId` - Update user (partial update)
- `DELETE /:userId` - Delete user

**Create User Example:**
```json
POST /api/users
{
  "displayName": "John Doe",
  "email": "john@example.com",
  "photoURL": "https://example.com/photo.jpg",
  "role": "customer",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001"
}
```

**Query Parameters for GET /:**
- `role` (optional): Filter by role (`customer` or `seller`)
- `limit` (optional): Number of users to return (default: 100)
- `offset` (optional): Number of users to skip (default: 0)

#### Productions API

Base URL: `/api/productions`

Manage theater productions and shows.

**Endpoints:**
- `POST /` - Create a new production
- `GET /` - Get all productions (with filtering by seller, status, category, pagination)
- `GET /:productionId` - Get production by ID
- `GET /seller/:sellerId` - Get productions by seller
- `PUT /:productionId` - Update production
- `PATCH /:productionId` - Update production (partial)
- `DELETE /:productionId` - Delete production

**Create Production Example:**
```json
POST /api/productions
{
  "title": "Hamilton",
  "description": "The revolutionary musical about Alexander Hamilton",
  "shortDescription": "Revolutionary musical about Alexander Hamilton",
  "imageURL": "https://example.com/hamilton.jpg",
  "sellerId": "seller_123",
  "venue": {
    "name": "Richard Rodgers Theatre",
    "address": "226 W 46th St, New York, NY 10036"
  },
  "duration": 165,
  "categories": ["musical", "drama", "historical"],
  "status": "active",
  "startDate": "2025-10-25",
  "endDate": "2025-11-08",
  "director": "Thomas Kail"
}
```

**Query Parameters for GET /:**
- `sellerId` (optional): Filter by seller ID
- `status` (optional): Filter by status (`active`, `upcoming`, `past`, `draft`)
- `category` (optional): Filter by category
- `limit` (optional): Number of productions to return (default: 100)
- `offset` (optional): Number of productions to skip (default: 0)

#### Performances API

Base URL: `/api/productions/:productionId/performances`

Manage specific performance dates and times for productions.

**Endpoints:**
- `POST /` - Create a new performance for a production
- `GET /` - Get all performances for a production (with filtering by status, date range, pagination)
- `GET /:performanceId` - Get performance by ID
- `PUT /:performanceId` - Update performance
- `PATCH /:performanceId` - Update performance (partial)
- `DELETE /:performanceId` - Delete performance

**Create Performance Example:**
```json
POST /api/productions/prod_123/performances
{
  "date": "2024-12-25T19:30:00Z",
  "sellerId": "seller_123",
  "venueId": "venue_456",
  "seatmapId": "seatmap_789",
  "status": "scheduled",
  "totalSeats": 1000,
  "soldSeats": 0,
  "priceCategories": [
    {
      "name": "Orchestra",
      "price": 15000
    },
    {
      "name": "Balcony",
      "price": 7500
    }
  ]
}
```

**Query Parameters for GET /:**
- `status` (optional): Filter by status (`scheduled`, `canceled`, `sold-out`, `completed`)
- `dateFrom` (optional): Filter by start date
- `dateTo` (optional): Filter by end date
- `limit` (optional): Number of performances to return (default: 100)
- `offset` (optional): Number of performances to skip (default: 0)

#### Venues API

Base URL: `/api/venues`

Manage theater venues and locations.

**Endpoints:**
- `POST /` - Create a new venue
- `GET /` - Get all venues (with filtering by seller, city, state, capacity, pagination)
- `GET /:venueId` - Get venue by ID
- `GET /seller/:sellerId` - Get venues by seller
- `PUT /:venueId` - Update venue
- `PATCH /:venueId` - Update venue (partial)
- `DELETE /:venueId` - Delete venue

**Create Venue Example:**
```json
POST /api/venues
{
  "name": "Madison Square Garden",
  "address": "4 Pennsylvania Plaza",
  "city": "New York",
  "state": "NY",
  "zipCode": "10001",
  "capacity": 20789,
  "imageURL": "https://example.com/msg.jpg",
  "sellerId": "seller_123"
}
```

**Query Parameters for GET /:**
- `sellerId` (optional): Filter by seller ID
- `city` (optional): Filter by city
- `state` (optional): Filter by state
- `minCapacity` (optional): Filter by minimum capacity
- `maxCapacity` (optional): Filter by maximum capacity
- `limit` (optional): Number of venues to return (default: 100)
- `offset` (optional): Number of venues to skip (default: 0)

#### Seatmaps API

Base URL: `/api/venues/:venueId/seatmaps`

Manage seating configurations for venues.

**Endpoints:**
- `POST /` - Create a new seatmap for a venue
- `GET /` - Get all seatmaps for a venue (with filtering by name, pagination)
- `GET /:seatmapId` - Get seatmap by ID
- `PUT /:seatmapId` - Update seatmap
- `PATCH /:seatmapId` - Update seatmap (partial)
- `DELETE /:seatmapId` - Delete seatmap

**Create Seatmap Example:**
```json
POST /api/venues/venue_123/seatmaps
{
  "name": "Main Floor Layout",
  "layout": {
    "type": "theater",
    "sections": 3,
    "rows": 20
  },
  "sections": [
    {
      "name": "Orchestra",
      "rows": 15,
      "seatsPerRow": 25
    },
    {
      "name": "Mezzanine",
      "rows": 10,
      "seatsPerRow": 20
    }
  ],
  "rows": [
    {
      "section": "Orchestra",
      "rowNumber": 1,
      "seats": 25
    }
  ],
  "seats": [
    {
      "id": "A1",
      "section": "Orchestra",
      "row": "A",
      "number": "1",
      "price": 15000
    }
  ]
}
```

**Query Parameters for GET /:**
- `name` (optional): Filter by seatmap name
- `limit` (optional): Number of seatmaps to return (default: 100)
- `offset` (optional): Number of seatmaps to skip (default: 0)

#### Orders API

Base URL: `/api/orders`

Manage customer orders and purchases.

**Endpoints:**
- `POST /` - Create a new order (with automatic ticket creation)
- `GET /` - Get all orders (with filtering by user, seller, status, payment status, pagination)
- `GET /:orderId` - Get order by ID
- `GET /user/:userId` - Get orders by user
- `GET /seller/:sellerId` - Get orders by seller
- `PUT /:orderId` - Update order
- `PATCH /:orderId` - Update order (partial)
- `DELETE /:orderId` - Delete order

**Create Order Example:**
```json
POST /api/orders
{
  "userId": "user_123",
  "sellerId": "seller_456",
  "productionId": "prod_789",
  "performanceId": "perf_101",
  "totalAmount": 30000,
  "status": "pending",
  "paymentStatus": "pending",
  "paymentMethod": "card",
  "tickets": [
    {
      "seatId": "A1",
      "section": "Orchestra",
      "row": "A",
      "seatNumber": "1",
      "price": 15000
    },
    {
      "seatId": "A2",
      "section": "Orchestra",
      "row": "A",
      "seatNumber": "2",
      "price": 15000
    }
  ]
}
```

**Query Parameters for GET /:**
- `userId` (optional): Filter by user ID
- `sellerId` (optional): Filter by seller ID
- `status` (optional): Filter by status (`pending`, `completed`, `canceled`, `refunded`)
- `paymentStatus` (optional): Filter by payment status (`pending`, `paid`, `refunded`, `failed`)
- `productionId` (optional): Filter by production ID
- `performanceId` (optional): Filter by performance ID
- `limit` (optional): Number of orders to return (default: 100)
- `offset` (optional): Number of orders to skip (default: 0)

#### Tickets API

Base URL: `/api/orders/:orderId/tickets`

Manage individual tickets within orders.

**Endpoints:**
- `POST /` - Create a new ticket for an order
- `GET /` - Get all tickets for an order (with filtering by status, section, pagination)
- `GET /:ticketId` - Get ticket by ID
- `PUT /:ticketId` - Update ticket
- `PATCH /:ticketId` - Update ticket (partial)
- `DELETE /:ticketId` - Delete ticket

**Create Ticket Example:**
```json
POST /api/orders/order_123/tickets
{
  "seatId": "B5",
  "section": "Orchestra",
  "row": "B",
  "seatNumber": "5",
  "price": 15000,
  "status": "valid"
}
```

**Query Parameters for GET /:**
- `status` (optional): Filter by status (`valid`, `used`, `canceled`, `refunded`)
- `section` (optional): Filter by seating section
- `limit` (optional): Number of tickets to return (default: 100)
- `offset` (optional): Number of tickets to skip (default: 0)

### Common Response Formats

All CRUD endpoints return consistent response formats:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

**Pagination (for list endpoints):**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### Connect Express Routes

Base URL: `/connect/express`

#### Create Express Account
**POST** `/create-account`

Creates a new Stripe Express connected account for a theater.

**Request Body:**
```json
{
  "theaterId": "string (required)",
  "name": "string (optional)"
}
```

**Response:**
```json
{
  "accountId": "acct_1234567890"
}
```

**Error Responses:**
- `400`: Missing theaterId
- `500`: Stripe API error

#### Get Onboarding Link
**POST** `/onboard-link`

Generates a single-use onboarding link for the Express account.

**Request Body:**
```json
{
  "accountId": "string (required)"
}
```

**Response:**
```json
{
  "url": "https://connect.stripe.com/setup/c/..."
}
```

#### Check Onboarding Status
**GET** `/status?theaterId={theaterId}`

Checks the onboarding status of an Express account.

**Query Parameters:**
- `theaterId` (required): Theater identifier

**Response:**
```json
{
  "ready": true,
  "charges_enabled": true,
  "details_submitted": true
}
```

#### Create Login Link
**POST** `/login-link`

Creates a login link for the Express account dashboard.

**Request Body:**
```json
{
  "theaterId": "string (required)"
}
```

**Response:**
```json
{
  "url": "https://connect.stripe.com/express/..."
}
```

#### Delete Account
**DELETE** `/account`

Deletes a connected account by accountId or theaterId.

**Request Body:**
```json
{
  "accountId": "string (optional)",
  "theaterId": "string (optional)"
}
```

**Response:**
```json
{
  "id": "acct_1234567890",
  "deleted": true,
  "object": "account"
}
```

#### Delete All Express Accounts
**DELETE** `/accounts/all`

Deletes all Express connected accounts.

**Response:**
```json
{
  "message": "Successfully deleted 2 Express accounts",
  "deletedCount": 2,
  "deletedAccounts": [
    {
      "accountId": "acct_1234567890"
    }
  ],
  "errors": []
}
```

### Connect Standard Routes

Base URL: `/connect/standard`

#### Start OAuth Flow
**GET** `/oauth/start?theaterId={theaterId}`

Initiates the OAuth flow for Standard account connection.

**Query Parameters:**
- `theaterId` (required): Theater identifier

**Response:** Redirects to Stripe OAuth authorization page

#### OAuth Callback
**GET** `/oauth/callback?code={code}&state={state}`

Handles the OAuth callback from Stripe.

**Query Parameters:**
- `code` (required): Authorization code from Stripe
- `state` (required): State parameter containing theaterId

**Response:** HTML page confirming successful connection

### Payment Routes

Base URL: `/payments`

#### Create Payment Intent
**POST** `/create-intent`

Creates a PaymentIntent for direct charging to a connected account.

**Request Body:**
```json
{
  "theaterId": "string (required)",
  "amountCents": "number (required)",
  "currency": "string (optional, default: 'usd')",
  "orderId": "string (optional)"
}
```

**Response:**
```json
{
  "clientSecret": "pi_1234567890_secret_..."
}
```

**Error Responses:**
- `400`: Missing theaterId or amountCents
- `404`: Theater not found
- `500`: Stripe API error

### Webhook Routes

Base URL: `/webhooks`

#### Stripe Webhook
**POST** `/stripe`

Handles Stripe webhook events with signature verification.

**Headers:**
- `stripe-signature`: Stripe webhook signature

**Request Body:** Raw JSON from Stripe webhook

**Supported Events:**
- `payment_intent.succeeded`: Payment completed
- `charge.dispute.created`: Dispute created
- `account.updated`: Account updated

**Response:** `200 OK` for successful processing

### Dashboard/Stripe Data Routes

Base URL: `/stripe-data`

#### Get All Accounts
**GET** `/accounts`

Retrieves comprehensive dashboard data for all connected accounts.

**Response:**
```json
{
  "summary": {
    "totalTheaters": 5,
    "expressAccounts": 3,
    "standardAccounts": 2,
    "activeAccounts": 4,
    "pendingAccounts": 1,
    "totalRevenue": 150000,
    "totalFees": 4350
  },
  "accounts": [
    {
      "theaterId": "theater_1",
      "theaterName": "Demo Theater",
      "accountType": "express",
      "status": "active",
      "stripeAccountId": "acct_1234567890",
      "chargesEnabled": true,
      "detailsSubmitted": true,
      "payoutsEnabled": true,
      "requirements": {...},
      "businessProfile": {...},
      "capabilities": {...},
      "balance": {
        "available": 50000,
        "pending": 10000,
        "currency": "usd"
      },
      "recentTransactions": [...],
      "created": 1640995200,
      "country": "US",
      "defaultCurrency": "usd",
      "error": null
    }
  ]
}
```

#### Get Specific Account
**GET** `/accounts/{theaterId}`

Retrieves detailed information for a specific theater account.

**Path Parameters:**
- `theaterId` (required): Theater identifier

**Response:** Same structure as individual account in `/accounts` endpoint

#### Get Products
**GET** `/products?limit={limit}&active={active}`

Retrieves all products from the main Stripe account.

**Query Parameters:**
- `limit` (optional): Number of products to return (default: 100)
- `active` (optional): Filter by active status (default: true)

**Response:**
```json
{
  "summary": {
    "totalProducts": 10,
    "activeProducts": 8,
    "inactiveProducts": 2
  },
  "products": [
    {
      "id": "prod_1234567890",
      "name": "Concert Ticket",
      "description": "General admission ticket",
      "active": true,
      "created": 1640995200,
      "updated": 1640995200,
      "metadata": {...},
      "images": [...],
      "type": "good",
      "unit_label": null,
      "url": null,
      "prices": [
        {
          "id": "price_1234567890",
          "active": true,
          "currency": "usd",
          "unit_amount": 5000,
          "recurring": null,
          "type": "one_time",
          "created": 1640995200
        }
      ]
    }
  ]
}
```

#### Get Payments
**GET** `/payments?limit={limit}&created_after={timestamp}&created_before={timestamp}`

Retrieves payment/charge data from the main Stripe account.

**Query Parameters:**
- `limit` (optional): Number of payments to return (default: 100)
- `created_after` (optional): Unix timestamp for filtering
- `created_before` (optional): Unix timestamp for filtering

**Response:**
```json
{
  "summary": {
    "totalPayments": 25,
    "successfulPayments": 23,
    "failedPayments": 2,
    "totalAmount": 125000,
    "totalRefunded": 5000,
    "netAmount": 120000
  },
  "payments": [
    {
      "id": "ch_1234567890",
      "amount": 5000,
      "amount_refunded": 0,
      "currency": "usd",
      "status": "succeeded",
      "created": 1640995200,
      "description": "Concert ticket",
      "customer": "cus_1234567890",
      "payment_intent": "pi_1234567890",
      "receipt_url": "https://pay.stripe.com/receipts/...",
      "refunded": false,
      "refunds": [],
      "source": {
        "id": "card_1234567890",
        "brand": "visa",
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2025
      },
      "metadata": {...}
    }
  ]
}
```

#### Get Customers
**GET** `/customers?limit={limit}&email={email}`

Retrieves customer data from the main Stripe account.

**Query Parameters:**
- `limit` (optional): Number of customers to return (default: 100)
- `email` (optional): Filter by email address

**Response:**
```json
{
  "summary": {
    "totalCustomers": 15,
    "activeCustomers": 14,
    "delinquentCustomers": 1
  },
  "customers": [
    {
      "id": "cus_1234567890",
      "email": "customer@example.com",
      "name": "John Doe",
      "phone": "+1234567890",
      "created": 1640995200,
      "updated": 1640995200,
      "balance": 0,
      "currency": "usd",
      "default_source": "card_1234567890",
      "delinquent": false,
      "description": "VIP customer",
      "metadata": {...},
      "shipping": {...},
      "tax_exempt": "none"
    }
  ]
}
```

#### Get Subscriptions
**GET** `/subscriptions?limit={limit}&status={status}&customer={customerId}`

Retrieves subscription data from the main Stripe account.

**Query Parameters:**
- `limit` (optional): Number of subscriptions to return (default: 100)
- `status` (optional): Filter by subscription status
- `customer` (optional): Filter by customer ID

**Response:**
```json
{
  "summary": {
    "totalSubscriptions": 8,
    "activeSubscriptions": 6,
    "canceledSubscriptions": 2,
    "trialingSubscriptions": 0,
    "totalRevenue": 24000
  },
  "subscriptions": [
    {
      "id": "sub_1234567890",
      "customer": "cus_1234567890",
      "status": "active",
      "created": 1640995200,
      "current_period_start": 1640995200,
      "current_period_end": 1643673600,
      "cancel_at_period_end": false,
      "canceled_at": null,
      "ended_at": null,
      "trial_start": null,
      "trial_end": null,
      "items": [
        {
          "id": "si_1234567890",
          "price": {
            "id": "price_1234567890",
            "unit_amount": 2000,
            "currency": "usd",
            "recurring": {
              "interval": "month",
              "interval_count": 1
            },
            "product": "prod_1234567890"
          },
          "quantity": 1
        }
      ],
      "metadata": {...}
    }
  ]
}
```

#### Get Overview
**GET** `/overview`

Retrieves comprehensive overview data including all Stripe entities.

**Response:**
```json
{
  "summary": {
    "accounts": {
      "total": 5,
      "active": 4,
      "pending": 1,
      "notConnected": 0
    },
    "products": {
      "total": 10,
      "active": 8
    },
    "payments": {
      "total": 25,
      "successful": 23,
      "totalAmount": 125000,
      "totalRefunded": 5000
    },
    "customers": {
      "total": 15,
      "active": 14,
      "delinquent": 1
    },
    "subscriptions": {
      "total": 8,
      "active": 6,
      "canceled": 2
    }
  },
  "accounts": [...],
  "recentProducts": [...],
  "recentPayments": [...],
  "recentCustomers": [...],
  "recentSubscriptions": [...]
}
```

#### Connected Account Endpoints

All the above endpoints have corresponding connected account versions:

- **GET** `/connected-accounts/{accountId}/products`
- **GET** `/connected-accounts/{accountId}/payments`
- **GET** `/connected-accounts/{accountId}/customers`
- **GET** `/connected-accounts/{accountId}/subscriptions`
- **GET** `/connected-accounts/{accountId}/overview`

These endpoints work identically to their main account counterparts but operate on the specified connected account.

#### Product Management

**POST** `/products`
**POST** `/connected-accounts/{accountId}/products`

Create a new product.

**Request Body:**
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "images": ["string array (optional)"],
  "metadata": "object (optional)",
  "type": "string (optional, default: 'good')",
  "unit_label": "string (optional)",
  "url": "string (optional)",
  "default_price_data": {
    "currency": "string (optional, default: 'usd')",
    "unit_amount": "number (required)",
    "tax_behavior": "string (optional)",
    "metadata": "object (optional)",
    "recurring": "object (optional)",
    "tiers": "array (optional)",
    "tiers_mode": "string (optional)",
    "transform_quantity": "object (optional)",
    "lookup_key": "string (optional)"
  }
}
```

**POST** `/products/{productId}/prices`
**POST** `/connected-accounts/{accountId}/products/{productId}/prices`

Create a price for a product.

**Request Body:**
```json
{
  "unit_amount": "number (required)",
  "currency": "string (optional, default: 'usd')",
  "recurring": "object (optional)",
  "metadata": "object (optional)",
  "active": "boolean (optional, default: true)",
  "nickname": "string (optional)",
  "tax_behavior": "string (optional)",
  "tiers": "array (optional)",
  "tiers_mode": "string (optional)",
  "transform_quantity": "object (optional)",
  "lookup_key": "string (optional)"
}
```

**PUT** `/products/{productId}`
**PUT** `/connected-accounts/{accountId}/products/{productId}`

Update a product.

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "images": "array (optional)",
  "metadata": "object (optional)",
  "unit_label": "string (optional)",
  "url": "string (optional)",
  "active": "boolean (optional)"
}
```

**DELETE** `/products/{productId}`
**DELETE** `/connected-accounts/{accountId}/products/{productId}`

Delete a product.

**Response:**
```json
{
  "success": true,
  "deleted": true,
  "id": "prod_1234567890"
}
```

## Data Models

### User
```json
{
  "id": "string",
  "displayName": "string",
  "email": "string",
  "photoURL": "string | null",
  "role": "customer | seller",
  "phone": "string | null",
  "address": "string | null",
  "city": "string | null",
  "state": "string | null",
  "zipCode": "string | null",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Production
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "shortDescription": "string",
  "imageURL": "string | null",
  "sellerId": "string",
  "venue": "object | null",
  "duration": "number | null",
  "categories": "string[]",
  "status": "active | upcoming | past | draft",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "performances": "object (subcollection)"
}
```

### Performance
```json
{
  "id": "string",
  "date": "string (ISO 8601)",
  "productionId": "string",
  "sellerId": "string",
  "venueId": "string",
  "seatmapId": "string | null",
  "status": "scheduled | canceled | sold-out | completed",
  "totalSeats": "number",
  "soldSeats": "number",
  "priceCategories": "object[]",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Venue
```json
{
  "id": "string",
  "name": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "zipCode": "string | null",
  "capacity": "number",
  "imageURL": "string | null",
  "sellerId": "string",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "seatmaps": "object (subcollection)"
}
```

### Seatmap
```json
{
  "id": "string",
  "name": "string",
  "layout": "object",
  "sections": "object[]",
  "rows": "object[]",
  "seats": "object[]",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Order
```json
{
  "id": "string",
  "userId": "string",
  "sellerId": "string",
  "productionId": "string",
  "performanceId": "string",
  "totalAmount": "number (cents)",
  "status": "pending | completed | canceled | refunded",
  "paymentStatus": "pending | paid | refunded | failed",
  "paymentMethod": "string | null",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "tickets": "object (subcollection)"
}
```

### Ticket
```json
{
  "id": "string",
  "seatId": "string | null",
  "section": "string | null",
  "row": "string | null",
  "seatNumber": "string | null",
  "price": "number (cents)",
  "status": "valid | used | canceled | refunded",
  "qrCode": "string",
  "createdAt": "string (ISO 8601)"
}
```

### Theater (Legacy)
```json
{
  "id": "string",
  "name": "string",
  "stripeAccountId": "string | null",
  "accountType": "express | standard | null"
}
```

### Account Status
```json
{
  "ready": "boolean",
  "charges_enabled": "boolean",
  "details_submitted": "boolean"
}
```

### Payment Intent
```json
{
  "clientSecret": "string"
}
```

### Webhook Event
```json
{
  "type": "string",
  "data": {
    "object": "object"
  },
  "account": "string | null"
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200**: Success
- **400**: Bad Request (missing required parameters)
- **404**: Not Found (theater/account not found)
- **500**: Internal Server Error (Stripe API errors, server errors)

Error responses follow this format:
```json
{
  "error": "Error message",
  "message": "Detailed error description (optional)"
}
```

## CORS Configuration

The API is configured to accept requests from:
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://stage-pass-b1d9b.web.app`

## Security Notes

- Webhook endpoints use raw body parsing for signature verification
- All other endpoints use JSON parsing
- Stripe webhook signatures are verified using the configured webhook secret
- CORS is configured for specific origins only

## Testing

### Postman Collection

A comprehensive Postman collection is included in the `postman/` directory with all API endpoints documented and ready for testing.

**Import the collection:**
1. Open Postman
2. Click "Import" 
3. Select `postman/postman.json`

**Environment Variables:**
The collection includes the following variables that you can customize:
- `api_base_url`: http://localhost:4242
- `user_id`: Sample user ID for testing
- `seller_id`: Sample seller ID for testing
- `production_id`: Sample production ID for testing
- `venue_id`: Sample venue ID for testing
- `order_id`: Sample order ID for testing

**Testing Workflow:**
1. Start the server: `npm start`
2. Import the Postman collection
3. Create a user first: `POST /api/users`
4. Create a seller user: `POST /api/users` (with role: "seller")
5. Create a venue: `POST /api/venues`
6. Create a production: `POST /api/productions`
7. Create a performance: `POST /api/productions/{id}/performances`
8. Create an order: `POST /api/orders`

### API Testing Examples

**Create a complete theater workflow:**
```bash
# 1. Create a seller user
curl -X POST http://localhost:4242/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Theater Owner",
    "email": "owner@theater.com",
    "role": "seller"
  }'

# 2. Create a venue
curl -X POST http://localhost:4242/api/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Broadway Theater",
    "address": "123 Broadway",
    "city": "New York",
    "state": "NY",
    "capacity": 1000,
    "sellerId": "seller_id_from_step_1"
  }'

# 3. Create a production
curl -X POST http://localhost:4242/api/productions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Lion King",
    "description": "A musical based on the Disney film",
    "sellerId": "seller_id_from_step_1",
    "status": "active"
  }'
```

## Development

### Local Development

The API uses nodemon for development with hot reloading. The server automatically restarts when files are changed.

```bash
npm start  # Starts with nodemon
```

### Firebase Functions Development

For Firebase Functions development, you can use the Firebase emulator:

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Start emulators
firebase emulators:start

# Or start only functions emulator
firebase emulators:start --only functions
```

The functions will be available at:
- Local: `http://localhost:5001/your-project-id/us-central1/api`
- Emulated: `http://localhost:5001/your-project-id/us-central1/api`

### Deployment

**Deploy to Firebase Functions:**
```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:api
```

**Deploy Firestore Rules and Indexes:**
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Deploy Everything:**
```bash
firebase deploy
```

### Project Structure

```
src/
├── index.js              # Main server file
├── db.js                 # Database operations
└── routes/
    ├── users.js          # User CRUD operations
    ├── productions.js    # Production CRUD operations
    ├── performances.js   # Performance CRUD operations
    ├── venues.js         # Venue CRUD operations
    ├── seatmaps.js       # Seatmap CRUD operations
    ├── orders.js         # Order CRUD operations
    ├── tickets.js        # Ticket CRUD operations
    ├── connectExpress.js # Stripe Express Connect
    ├── connectStandard.js# Stripe Standard Connect
    ├── payments.js       # Payment processing
    ├── webhooks.js       # Stripe webhooks
    └── dashboard.js      # Stripe data dashboard
```

### Database

The API uses **Firebase Firestore** as the primary database, providing real-time capabilities, automatic scaling, and built-in security rules.

**Firestore Collections:**
- `users`: User accounts (customers and sellers) - Document ID: Firebase Auth UID
- `productions`: Theater productions and shows - Auto-generated Document ID
- `venues`: Theater venues and locations - Auto-generated Document ID  
- `orders`: Customer orders and purchases - Auto-generated Document ID
- `theaters`: Legacy theater data (for Stripe Connect) - Auto-generated Document ID

**Subcollections:**
- `productions/{productionId}/performances`: Performance dates/times
- `venues/{venueId}/seatmaps`: Seating configurations
- `orders/{orderId}/tickets`: Individual tickets

**Security Rules:**
- Users can only read/write their own data
- Sellers can manage their own productions and venues
- Public read access for browsing productions and venues
- Proper parent-child relationship validation

**Firebase Features Used:**
- **Firestore**: NoSQL document database
- **Firebase Functions**: Serverless backend functions
- **Firebase Auth**: User authentication (optional)
- **Firebase Security Rules**: Data access control
- **Firebase Indexes**: Optimized query performance

## License

ISC