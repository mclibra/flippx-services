# Payment APIs Documentation

This document provides comprehensive documentation for all payment-related APIs in the system. The payment system integrates with Rapyd Collect for payment processing and payouts.

## Table of Contents

- [Authentication](#authentication)
- [Wallet APIs](#wallet-apis)
- [Payment Collection APIs](#payment-collection-apis)
- [Withdrawal/Payout APIs](#withdrawalpayout-apis)
- [Webhook APIs](#webhook-apis)
- [Manual Payment APIs (Admin)](#manual-payment-apis-admin)
- [Error Responses](#error-responses)

---

## Authentication

All APIs require authentication using Bearer token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

Additionally, all requests require an API key header:

```
x-api-key: <your_api_key>
```

---

## Wallet APIs

### Get User Balance

Retrieve the current wallet balance for the authenticated user.

**Endpoint:** `GET /api/wallet/balance`

**Authentication:** Required (User)

**Request:**
```http
GET /api/wallet/balance
Authorization: Bearer <token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "balance": {
    "virtual": 100.50,
    "realWithdrawable": 250.00,
    "realNonWithdrawable": 50.00,
    "totalReal": 300.00
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Failed to fetch balance"
}
```

---

### Get Wallet Summary (Admin)

Get aggregated wallet statistics across all users. Admin only.

**Endpoint:** `GET /api/wallet/summary`

**Authentication:** Required (Admin)

**Request:**
```http
GET /api/wallet/summary
Authorization: Bearer <admin_token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "wallets": {
      "totalUsers": 150,
      "totalVirtualBalance": 50000.00,
      "totalRealWithdrawable": 75000.00,
      "totalRealNonWithdrawable": 10000.00,
      "totalPendingWithdrawals": 5000.00
    },
    "payments": {
      "PENDING": {
        "count": 5,
        "totalAmount": 250.00
      },
      "COMPLETED": {
        "count": 1200,
        "totalAmount": 50000.00
      },
      "FAILED": {
        "count": 10,
        "totalAmount": 500.00
      }
    }
  }
}
```

---

## Payment Collection APIs

### Initiate Plan Purchase

Create a payment session for purchasing a plan or adding virtual/real cash to wallet.

**Endpoint:** `POST /api/wallet/purchase/initiate`

**Authentication:** Required (User)

**Request Body:**
```json
{
  "amount": 100.00,
  "currency": "USD",
  "planId": "507f1f77bcf86cd799439011",
  "virtualCashAmount": 80.00,
  "realCashAmount": 20.00
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Total payment amount |
| `currency` | string | No | Currency code (default: "USD") |
| `planId` | string | No | Plan ID if purchasing a plan |
| `virtualCashAmount` | number | No | Amount to credit as virtual cash (required if no planId) |
| `realCashAmount` | number | No | Amount to credit as real cash (required if no planId) |

**Note:** If `planId` is provided, `virtualCashAmount` and `realCashAmount` are taken from the plan. If not provided, `virtualCashAmount + realCashAmount` must equal `amount`.

**Response:**
```json
{
  "success": true,
  "paymentUrl": "https://checkout.rapyd.net/checkout/...",
  "sessionId": "vcash_507f1f77bcf86cd799439011_1234567890",
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "amount": 100.00,
    "currency": "USD",
    "plan": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Premium Plan"
    },
    "virtualCashAmount": 80.00,
    "realCashAmount": 20.00
  }
}
```

**Error Responses:**

```json
// Invalid amount
{
  "success": false,
  "error": "Valid amount is required"
}

// Plan not found
{
  "success": false,
  "error": "Plan not found"
}

// Plan not available
{
  "success": false,
  "error": "Plan is not available for purchase"
}

// Amount mismatch
{
  "success": false,
  "error": "Amount mismatch. Provided: $100, Expected: $99.99"
}

// Already has active plan
{
  "success": false,
  "error": "You already have an active subscription to this plan"
}

// Cash amounts don't sum
{
  "success": false,
  "error": "Virtual and real cash amounts must sum to total amount"
}

// Payment service error
{
  "success": false,
  "error": "Payment service temporarily unavailable. Please try again later."
}
```

---

### Handle Purchase Success

Callback endpoint called when user successfully completes payment. This is called by Rapyd after payment completion.

**Endpoint:** `GET /api/wallet/purchase/success`

**Authentication:** Not required (Public callback)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session ID from payment initiation |

**Request:**
```http
GET /api/wallet/purchase/success?session_id=vcash_507f1f77bcf86cd799439011_1234567890
```

**Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "amount": 100.00,
    "virtualCashAmount": 80.00,
    "realCashAmount": 20.00,
    "plan": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Premium Plan"
    },
    "status": "COMPLETED"
  }
}
```

**Error Responses:**

```json
// Missing session ID
{
  "success": false,
  "error": "Session ID is required"
}

// Payment not found
{
  "success": false,
  "error": "Payment session not found"
}

// Already processed
{
  "success": true,
  "message": "Payment already processed",
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "amount": 100.00,
    "status": "COMPLETED"
  }
}
```

---

### Handle Purchase Cancel

Callback endpoint called when user cancels payment.

**Endpoint:** `GET /api/wallet/purchase/cancel`

**Authentication:** Not required (Public callback)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session ID from payment initiation |

**Request:**
```http
GET /api/wallet/purchase/cancel?session_id=vcash_507f1f77bcf86cd799439011_1234567890
```

**Response:**
```json
{
  "success": true,
  "message": "Payment cancelled successfully",
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "amount": 100.00,
    "status": "CANCELLED"
  }
}
```

---

## Withdrawal/Payout APIs

### Initiate Withdrawal

Request a withdrawal to bank account. Amount is deducted from withdrawable balance immediately and status is set to PENDING.

**Endpoint:** `POST /api/withdrawal`

**Authentication:** Required (User)

**Request Body:**
```json
{
  "amount": 100.00,
  "bankAccountId": "507f1f77bcf86cd799439020"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Withdrawal amount (must be positive) |
| `bankAccountId` | string | Yes | Bank account ID to withdraw to |

**Response:**
```json
{
  "success": true,
  "withdrawal": {
    "id": "507f1f77bcf86cd799439021",
    "user": "507f1f77bcf86cd799439010",
    "bankAccount": "507f1f77bcf86cd799439020",
    "amount": 100.00,
    "fee": 0.00,
    "netAmount": 100.00,
    "status": "PENDING",
    "requestDate": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Withdrawal initiated and pending approval"
}
```

**Error Responses:**

```json
// Invalid amount
{
  "success": false,
  "error": "Invalid withdrawal amount"
}

// Missing bank account
{
  "success": false,
  "error": "Bank account is required"
}

// Insufficient balance
{
  "success": false,
  "error": "Insufficient withdrawable real cash balance",
  "availableWithdrawable": 50.00,
  "totalReal": 150.00
}

// Invalid bank account
{
  "success": false,
  "error": "Invalid bank account"
}

// Withdrawal limit exceeded
{
  "success": false,
  "error": "Withdrawal amount exceeds your weekly limit. Available: $50, Requested: $100",
  "availableAmount": 50.00,
  "weeklyLimit": 200.00,
  "usedAmount": 150.00,
  "resetDate": "2024-01-22T00:00:00.000Z"
}
```

---

### Get User Withdrawals

Get list of withdrawals for the authenticated user.

**Endpoint:** `GET /api/withdrawal`

**Authentication:** Required (User)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of results per page (default: 10) |
| `offset` | number | No | Number of results to skip (default: 0) |
| `status` | string | No | Filter by status (PENDING, APPROVED, REJECTED, PROCESSING, COMPLETED, FAILED) |

**Request:**
```http
GET /api/withdrawal?limit=10&offset=0&status=PENDING
Authorization: Bearer <token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "507f1f77bcf86cd799439021",
      "user": "507f1f77bcf86cd799439010",
      "bankAccount": {
        "id": "507f1f77bcf86cd799439020",
        "bankName": "Chase Bank",
        "maskedAccountNumber": "****1234",
        "accountHolderName": "John Doe"
      },
      "amount": 100.00,
      "fee": 0.00,
      "netAmount": 100.00,
      "status": "PENDING",
      "requestDate": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 1,
  "pagination": {
    "limit": 10,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### Approve Withdrawal (Admin)

Approve a withdrawal request and initiate payout via Rapyd. Creates beneficiary if needed and processes payout.

**Endpoint:** `POST /api/withdrawal/:id/approve`

**Authentication:** Required (Admin)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Withdrawal ID |

**Request:**
```http
POST /api/withdrawal/507f1f77bcf86cd799439021/approve
Authorization: Bearer <admin_token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "withdrawal": {
    "id": "507f1f77bcf86cd799439021",
    "user": {
      "id": "507f1f77bcf86cd799439010",
      "name": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "email": "john@example.com"
    },
    "bankAccount": {
      "id": "507f1f77bcf86cd799439020",
      "bankName": "Chase Bank",
      "accountHolderName": "John Doe",
      "accountNumber": "1234567890",
      "routingNumber": "021000021"
    },
    "amount": 100.00,
    "fee": 0.00,
    "netAmount": 100.00,
    "status": "PROCESSING",
    "paymentReference": "payout_123456789",
    "paymentDetails": {
      "rapydBeneficiaryId": "beneficiary_123456",
      "rapydPayoutId": "payout_123456789",
      "rapydPayoutData": { ... }
    },
    "approvedBy": "507f1f77bcf86cd799439099",
    "processedDate": "2024-01-15T11:00:00.000Z"
  },
  "message": "Withdrawal approved and payout initiated successfully",
  "payoutId": "payout_123456789"
}
```

**Error Responses:**

```json
// Unauthorized
{
  "success": false,
  "error": "Unauthorized"
}

// Withdrawal not found
{
  "success": false,
  "error": "Withdrawal not found"
}

// Invalid status
{
  "success": false,
  "error": "Withdrawal is not in pending status"
}

// Rapyd payout error
{
  "success": false,
  "error": "Failed to create payout with Rapyd. Please try again."
}
```

---

### Reject Withdrawal (Admin)

Reject a withdrawal request. Amount is refunded to user's wallet.

**Endpoint:** `POST /api/withdrawal/:id/reject`

**Authentication:** Required (Admin)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Withdrawal ID |

**Request Body:**
```json
{
  "reason": "Insufficient verification documents"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | No | Rejection reason (default: "Rejected by admin") |

**Response:**
```json
{
  "success": true,
  "withdrawal": {
    "id": "507f1f77bcf86cd799439021",
    "status": "REJECTED",
    "rejectionReason": "Insufficient verification documents",
    "approvedBy": "507f1f77bcf86cd799439099",
    "processedDate": "2024-01-15T11:00:00.000Z"
  },
  "message": "Withdrawal rejected and amount refunded"
}
```

**Error Responses:**

```json
// Unauthorized
{
  "success": false,
  "error": "Unauthorized"
}

// Withdrawal not found
{
  "success": false,
  "error": "Withdrawal not found"
}

// Invalid status
{
  "success": false,
  "error": "Withdrawal is not in pending status"
}
```

---

### Get Admin Withdrawals

Get all withdrawals with filtering options. Admin only.

**Endpoint:** `GET /api/withdrawal/admin`

**Authentication:** Required (Admin)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of results per page (default: 20) |
| `offset` | number | No | Number of results to skip (default: 0) |
| `status` | string | No | Filter by status |
| `userId` | string | No | Filter by user ID |

**Request:**
```http
GET /api/withdrawal/admin?limit=20&offset=0&status=PENDING&userId=507f1f77bcf86cd799439010
Authorization: Bearer <admin_token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "507f1f77bcf86cd799439021",
      "user": {
        "id": "507f1f77bcf86cd799439010",
        "name": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "phone": "+1234567890",
        "email": "john@example.com"
      },
      "bankAccount": { ... },
      "amount": 100.00,
      "fee": 0.00,
      "netAmount": 100.00,
      "status": "PENDING",
      "approvedBy": null,
      "requestDate": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 1,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## Webhook APIs

### Rapyd Webhook Handler

Receive and process webhook events from Rapyd for payment and payout status updates.

**Endpoint:** `POST /api/wallet/webhook/rapyd`

**Authentication:** Not required (Webhook signature verification)

**Headers:**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `signature` | string | Yes | HMAC signature from Rapyd |
| `timestamp` | string | Yes | Timestamp from Rapyd |
| `salt` | string | Yes | Salt from Rapyd |

**Request Body:**
```json
{
  "type": "PAYMENT_COMPLETED",
  "data": {
    "id": "payment_123456789",
    "status": "CLO",
    "amount": 100.00,
    "currency": "USD",
    "metadata": {
      "userId": "507f1f77bcf86cd799439010",
      "sessionId": "vcash_507f1f77bcf86cd799439011_1234567890"
    }
  }
}
```

**Webhook Event Types:**

- `PAYMENT_COMPLETED` / `PAYMENT_SUCCEEDED` - Payment completed successfully
- `PAYMENT_FAILED` - Payment failed
- `PAYMENT_CANCELLED` - Payment cancelled
- `PAYOUT_COMPLETED` / `PAYOUT_SUCCEEDED` - Payout completed successfully
- `PAYOUT_FAILED` - Payout failed
- `PAYOUT_CANCELLED` - Payout cancelled

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

**Error Responses:**

```json
// Invalid signature
{
  "success": false,
  "error": "Invalid webhook signature"
}

// Missing payment ID
{
  "success": false,
  "error": "Payment ID or session ID not found in webhook"
}

// Payment not found
{
  "success": false,
  "error": "Payment not found"
}
```

---

## Manual Payment APIs (Admin)

### Create Payment Record

Create a payment record manually (admin only). Does not process payment, just creates record.

**Endpoint:** `POST /api/wallet/payments`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439010",
  "amount": 100.00,
  "paymentMethod": "CREDIT_CARD",
  "planId": "507f1f77bcf86cd799439011",
  "description": "Manual payment entry"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User ID to credit |
| `amount` | number | Yes | Payment amount |
| `paymentMethod` | string | Yes | Payment method (CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, RAPYD_CHECKOUT) |
| `planId` | string | No | Associated plan ID |
| `description` | string | No | Payment description |

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "user": "507f1f77bcf86cd799439010",
    "amount": 100.00,
    "currency": "USD",
    "method": "CREDIT_CARD",
    "status": "PENDING",
    "plan": "507f1f77bcf86cd799439011",
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "message": "Payment created successfully"
}
```

---

### Create Manual Bank Transfer Payment

Create a manual payment record for bank transfer with detailed information.

**Endpoint:** `POST /api/wallet/payments/manual`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439010",
  "amount": 100.00,
  "bankTransferReference": "TXN123456789",
  "bankName": "Chase Bank",
  "transferDate": "2024-01-15T10:00:00.000Z",
  "depositorName": "John Doe",
  "notes": "Bank transfer received",
  "planId": "507f1f77bcf86cd799439011"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User ID to credit |
| `amount` | number | Conditional | Payment amount (required if no planId) |
| `bankTransferReference` | string | Yes | Bank transaction reference/ID |
| `bankName` | string | No | Bank name |
| `transferDate` | string | No | Transfer date (ISO 8601) |
| `depositorName` | string | No | Name of depositor |
| `notes` | string | No | Additional notes |
| `planId` | string | No | Plan ID (if provided, amount taken from plan) |

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "user": "507f1f77bcf86cd799439010",
    "amount": 100.00,
    "currency": "USD",
    "method": "BANK_TRANSFER",
    "status": "PENDING",
    "isManual": true,
    "bankTransferReference": "TXN123456789",
    "bankName": "Chase Bank",
    "transferDate": "2024-01-15T10:00:00.000Z",
    "depositorName": "John Doe",
    "notes": "Bank transfer received",
    "plan": "507f1f77bcf86cd799439011",
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "message": "Manual payment record created successfully with amount $100 from plan \"Premium Plan\""
}
```

---

### Confirm Payment

Confirm a pending payment and credit wallet. Used for manual payments.

**Endpoint:** `POST /api/wallet/payments/confirm`

**Authentication:** Required (Admin or Payment Owner)

**Request Body:**
```json
{
  "paymentId": "507f1f77bcf86cd799439012"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymentId` | string | Yes | Payment ID to confirm |

**Response:**
```json
{
  "success": true,
  "message": "Payment confirmed and wallet credited successfully",
  "payment": {
    "id": "507f1f77bcf86cd799439012",
    "amount": 100.00,
    "virtualCashAmount": 80.00,
    "realCashAmount": 20.00,
    "plan": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Premium Plan"
    },
    "status": "COMPLETED"
  }
}
```

**Error Responses:**

```json
// Payment not found
{
  "success": false,
  "error": "Payment not found"
}

// Unauthorized
{
  "success": false,
  "error": "Unauthorized to confirm this payment"
}

// Already processed
{
  "success": false,
  "error": "Payment is already completed"
}
```

---

### Get All Payments (Admin)

Get all payments with filtering and pagination. Admin only.

**Endpoint:** `GET /api/wallet/payments/admin`

**Authentication:** Required (Admin)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20) |
| `status` | string | No | Filter by status |
| `method` | string | No | Filter by payment method |
| `userId` | string | No | Filter by user ID |

**Request:**
```http
GET /api/wallet/payments/admin?page=1&limit=20&status=COMPLETED&method=RAPYD_CHECKOUT
Authorization: Bearer <admin_token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "507f1f77bcf86cd799439012",
      "user": {
        "id": "507f1f77bcf86cd799439010",
        "name": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "phone": "+1234567890",
        "email": "john@example.com"
      },
      "amount": 100.00,
      "currency": "USD",
      "method": "RAPYD_CHECKOUT",
      "status": "COMPLETED",
      "plan": {
        "id": "507f1f77bcf86cd799439011",
        "name": "Premium Plan",
        "price": 100.00
      },
      "virtualCashAmount": 80.00,
      "realCashAmount": 20.00,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "confirmedBy": {
        "id": "507f1f77bcf86cd799439099",
        "name": {
          "firstName": "Admin",
          "lastName": "User"
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### Get User Payments

Get payments for the authenticated user.

**Endpoint:** `GET /api/wallet/payments`

**Authentication:** Required (User)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 10) |
| `status` | string | No | Filter by status |

**Request:**
```http
GET /api/wallet/payments?page=1&limit=10&status=COMPLETED
Authorization: Bearer <token>
x-api-key: <api_key>
```

**Response:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "507f1f77bcf86cd799439012",
      "user": "507f1f77bcf86cd799439010",
      "amount": 100.00,
      "currency": "USD",
      "method": "RAPYD_CHECKOUT",
      "status": "COMPLETED",
      "plan": {
        "id": "507f1f77bcf86cd799439011",
        "name": "Premium Plan",
        "price": 100.00
      },
      "virtualCashAmount": 80.00,
      "realCashAmount": 20.00,
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

## Error Responses

All APIs follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Invalid or missing authentication |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource not found |
| `500` | Internal Server Error - Server error |

### Common Error Messages

- `"Valid amount is required"` - Amount is missing or invalid
- `"Unauthorized"` - User doesn't have required permissions
- `"Unauthorized - Admin access required"` - Admin role required
- `"Payment not found"` - Payment ID doesn't exist
- `"Withdrawal not found"` - Withdrawal ID doesn't exist
- `"Insufficient withdrawable real cash balance"` - Not enough balance
- `"Plan not found"` - Plan ID doesn't exist
- `"Plan is not available for purchase"` - Plan is inactive
- `"Invalid webhook signature"` - Webhook signature verification failed
- `"Payment service temporarily unavailable"` - Rapyd API error

---

## Payment Status Values

### Payment Statuses

- `PENDING` - Payment initiated, awaiting completion
- `COMPLETED` - Payment successful, wallet credited
- `FAILED` - Payment failed
- `CANCELLED` - Payment cancelled by user
- `REFUNDED` - Payment refunded

### Withdrawal Statuses

- `PENDING` - Withdrawal requested, awaiting admin approval
- `APPROVED` - Withdrawal approved (deprecated, use PROCESSING)
- `REJECTED` - Withdrawal rejected by admin
- `PROCESSING` - Payout initiated, being processed by Rapyd
- `COMPLETED` - Payout completed successfully
- `FAILED` - Payout failed

### Payment Methods

- `RAPYD_CHECKOUT` - Rapyd hosted checkout page
- `CREDIT_CARD` - Credit card payment
- `DEBIT_CARD` - Debit card payment
- `BANK_TRANSFER` - Bank transfer payment

---

## Notes

1. **Currency**: Currently supports USD. Other currencies can be added by updating Rapyd configuration.

2. **Webhooks**: Configure webhook URL in Rapyd dashboard: `https://yourdomain.com/api/wallet/webhook/rapyd`

3. **Payout Method Types**: Currently defaults to `us_standard_bank_account`. Update based on supported countries and payment methods.

4. **Session IDs**: Session IDs are unique identifiers for tracking payments. Format: `vcash_{userId}_{timestamp}` for purchases, `manual_{userId}_{timestamp}_{random}` for manual payments.

5. **Idempotency**: Payment and withdrawal operations are idempotent. Duplicate requests with same parameters will return existing records.

6. **Rate Limiting**: Consider implementing rate limiting for production use.

7. **Testing**: Use Rapyd sandbox environment (`https://sandboxapi.rapyd.net`) for testing. Update `RAPYD_API_URL` to `https://api.rapyd.net` for production.

---

## Support

For issues or questions:
- Check Rapyd documentation: https://docs.rapyd.net
- Review server logs for detailed error messages
- Contact system administrator for access issues
