# Transaction API Documentation

Complete API documentation for user transaction management, including transaction initiation, processing, listing, summaries, and analytics.

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [Transaction Management](#transaction-management)
4. [Transaction Queries](#transaction-queries)
5. [Data Models](#data-models)
6. [Transaction Types](#transaction-types)
7. [Error Handling](#error-handling)

---

## Base URL

All endpoints are prefixed with `/api/transaction`

```
Base URL: https://your-api-domain.com/api/transaction
```

---

## Authentication

All endpoints require authentication using a Bearer token in the Authorization header. Role-based access control applies to different endpoints.

### Headers Required

```
Content-Type: application/json
x-api-key: YOUR_API_KEY
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Role Requirements

- **ADMIN**: Full access to all endpoints
- **AGENT**: Can initiate/process transactions and view own transactions
- **DEALER**: Can initiate/process transactions and view own transactions

---

## Transaction Management

### 1. Initiate Transaction

Initiate a new transaction. Creates a pending transaction record that can be processed later.

**Endpoint:** `POST /api/transaction/initiate`

**Authentication:** Required (AGENT, DEALER roles)

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "amount": 100.50,
  "amountType": "VIRTUAL",
  "transactionType": "DEPOSIT"
}
```

**Request Parameters:**
- `userId` (String, required): Target user ID for the transaction
- `amount` (Number, required): Transaction amount (must be > 0)
- `amountType` (String, optional): Cash type - `REAL` or `VIRTUAL` (default: `VIRTUAL`)
- `transactionType` (String, optional): Transaction type identifier (default: `DEPOSIT`)

**Transaction Type Values:**
- `DEPOSIT` - Deposit funds to user
- `WITHDRAW` - Withdraw funds from user (requires REAL cash type)
- Other transaction identifiers as needed

**Success Response (200):**
```json
{
  "success": true,
  "transaction": {
    "id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "amount": 100.50,
    "realAmount": 0,
    "virtualAmount": 100.50,
    "amountType": "VIRTUAL",
    "transactionType": "DEPOSIT",
    "status": "PENDING"
  },
  "message": "Transaction initiated successfully"
}
```

**Error Responses:**

**400 Bad Request - Invalid parameters:**
```json
{
  "success": false,
  "error": "Valid userId and amount are required"
}
```

**400 Bad Request - Invalid amount type:**
```json
{
  "success": false,
  "error": "amountType must be REAL or VIRTUAL"
}
```

**400 Bad Request - Invalid withdrawal type:**
```json
{
  "success": false,
  "error": "Withdrawals are only allowed for REAL cash type"
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/transaction/initiate \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "amount": 100.50,
    "amountType": "VIRTUAL",
    "transactionType": "DEPOSIT"
  }'
```

**Notes:**
- Creates a pending transaction record
- Actual wallet balance update happens in `/process` endpoint
- Withdrawals require `amountType` to be `REAL`

---

### 2. Process Transaction

Process a pending transaction or create and process a new transaction immediately.

**Endpoint:** `POST /api/transaction/process`

**Authentication:** Required (AGENT, DEALER roles)

**Request Body:**

#### Process Existing Transaction
```json
{
  "transactionId": "507f1f77bcf86cd799439012"
}
```

#### Create and Process New Transaction
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "amount": 100.50,
  "amountType": "VIRTUAL"
}
```

**Request Parameters:**
- `transactionId` (String, optional): ID of pending transaction to process
- `userId` (String, required if no transactionId): Target user ID
- `amount` (Number, required if no transactionId): Transaction amount
- `amountType` (String, optional): Cash type - `REAL` or `VIRTUAL` (default: `VIRTUAL`)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Transaction processed successfully",
  "transaction": {
    "userId": "507f1f77bcf86cd799439011",
    "amount": 100.50,
    "realAmount": 0,
    "virtualAmount": 100.50,
    "amountType": "VIRTUAL"
  }
}
```

**Error Responses:**

**400 Bad Request - Missing parameters:**
```json
{
  "success": false,
  "error": "Either transactionId or userId and amount are required"
}
```

**404 Not Found - Transaction not found:**
```json
{
  "success": false,
  "error": "Transaction not found"
}
```

**400 Bad Request - Transaction already processed:**
```json
{
  "success": false,
  "error": "Transaction is already completed"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Insufficient balance" // or other error messages
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/transaction/process \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "transactionId": "507f1f77bcf86cd799439012"
  }'
```

**Notes:**
- Updates wallet balances immediately
- Validates sufficient balance before processing
- Updates transaction status to `COMPLETED`
- Handles commission calculations for agents/dealers

---

## Transaction Queries

### 3. Get Transactions List

Retrieve a paginated list of transactions with filtering options.

**Endpoint:** `GET /api/transaction/list`

**Authentication:** Required (ADMIN, AGENT, DEALER roles)

**Query Parameters:**
- `sortBy` (String, optional): Field to sort by (default: `createdAt`)
- `sortOrder` (String, optional): Sort order - `asc` or `desc` (default: `desc`)
- `offset` (Number, optional): Number of records to skip (default: `0`)
- `limit` (Number, optional): Maximum number of records to return (default: `10`)
- `cashType` (String, optional): Filter by cash type - `REAL` or `VIRTUAL`
- `transactionType` (String, optional): Filter by transaction type - `CREDIT` or `DEBIT`
- `status` (String, optional): Filter by status - `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`
- `startDate` (String, optional): Start date for date range filter (ISO 8601 format)
- `endDate` (String, optional): End date for date range filter (ISO 8601 format)

**Note:** Non-ADMIN users can only view their own transactions.

**Success Response (200):**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "phone": "1234567890"
      },
      "cashType": "VIRTUAL",
      "transactionType": "CREDIT",
      "transactionIdentifier": "DEPOSIT",
      "transactionAmount": 100.50,
      "realAmount": 0,
      "virtualAmount": 100.50,
      "previousBalance": 500.00,
      "newBalance": 600.50,
      "status": "COMPLETED",
      "referenceType": "USER",
      "referenceIndex": "507f1f77bcf86cd799439013",
      "referenceUser": {
        "_id": "507f1f77bcf86cd799439013",
        "name": {
          "firstName": "Jane",
          "lastName": "Smith"
        },
        "phone": "0987654321"
      },
      "transactionData": {
        "paymentId": "507f1f77bcf86cd799439014"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 150
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Error details"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/transaction/list?limit=20&offset=0&cashType=VIRTUAL&status=COMPLETED&startDate=2024-01-01&endDate=2024-01-31" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Returns transactions with populated user information
- Includes separate `realAmount` and `virtualAmount` fields for easier filtering
- Populates reference data based on `referenceType` (USER, AGENT, PLAN, PAYMENT)
- ADMIN users can view all transactions; others see only their own

---

### 4. Get Transaction Summary

Get aggregated summary statistics for transactions with optional filters.

**Endpoint:** `GET /api/transaction/summary`

**Authentication:** Required (ADMIN, AGENT, DEALER roles)

**Query Parameters:**
- `startDate` (String, optional): Start date for date range filter (ISO 8601 format)
- `endDate` (String, optional): End date for date range filter (ISO 8601 format)
- `cashType` (String, optional): Filter by cash type - `REAL` or `VIRTUAL`
- `transactionType` (String, optional): Filter by transaction type - `CREDIT` or `DEBIT`
- `status` (String, optional): Filter by status - `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`

**Note:** Non-ADMIN users can only view summaries for their own transactions.

**Success Response (200):**
```json
{
  "success": true,
  "summary": {
    "totalTransactions": 150,
    "totalAmount": 15000.50,
    "totalRealAmount": 5000.25,
    "totalVirtualAmount": 10000.25,
    "totalCredits": 12000.00,
    "totalCreditsReal": 4000.00,
    "totalCreditsVirtual": 8000.00,
    "totalDebits": 3000.50,
    "totalDebitsReal": 1000.25,
    "totalDebitsVirtual": 2000.25
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to get transaction summary"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/transaction/summary?startDate=2024-01-01&endDate=2024-01-31&cashType=REAL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Provides separate totals for REAL and VIRTUAL cash types
- Breaks down credits and debits separately
- Useful for financial reporting and analytics

---

**Note:** Admin-only transaction analytics endpoints have been moved to `/api/admin/transaction-management`. See the Admin Transaction Management API documentation for commission summaries, tier-based payout analytics, and revenue impact comparisons.

## Data Models

### Transaction Model

```typescript
{
  _id: ObjectId,
  user: ObjectId, // Reference to User
  cashType: String, // Enum: 'REAL', 'VIRTUAL'
  referenceType: String, // Optional: 'USER', 'AGENT', 'PLAN', 'PAYMENT'
  referenceIndex: String, // Optional: Reference ID based on referenceType
  transactionType: String, // Enum: 'DEBIT', 'CREDIT', 'COMPLETED_DEBIT'
  transactionIdentifier: String, // Transaction type identifier (see Transaction Types section)
  transactionAmount: Number, // Transaction amount
  previousBalance: Number, // Wallet balance before transaction
  newBalance: Number, // Wallet balance after transaction
  transactionData: Object, // Additional transaction metadata
  status: String, // Enum: 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'
  createdAt: Date,
  updatedAt: Date
}
```

### Transaction Response (Enhanced)

Transactions returned in list endpoints include additional computed fields:

```typescript
{
  // ... base transaction fields ...
  realAmount: Number, // Amount if cashType is REAL, otherwise 0
  virtualAmount: Number, // Amount if cashType is VIRTUAL, otherwise 0
  referenceUser: Object, // Populated user data if referenceType is USER or AGENT
  referencePlan: Object, // Populated plan data if referenceType is PLAN
  referencePayment: Object // Populated payment data if referenceType is PAYMENT
}
```

---

## Transaction Types

### Transaction Identifiers

The system supports various transaction identifiers that determine how transactions are processed:

#### Payment & Purchase Transactions
- `VIRTUAL_CASH_PURCHASE` - Virtual cash purchase (credits to virtual balance)
- `REAL_CASH_PURCHASE` - Real cash purchase (credits to non-withdrawable real balance)
- `PLAN_PURCHASE_VIRTUAL` - Plan purchase with virtual cash
- `PLAN_PURCHASE_REAL` - Plan purchase with real cash
- `WIRE_TRANSFER` - Wire transfer (credits to non-withdrawable real balance)
- `PURCHASE` - General purchase (credits to non-withdrawable real balance)

#### Withdrawal Transactions
- `WITHDRAWAL_REQUEST` - Withdrawal request initiated (debits from withdrawable real balance)
- `WITHDRAWAL_PENDING` - Withdrawal pending processing
- `WITHDRAWAL_COMPLETED` - Withdrawal completed
- `WITHDRAWAL_REJECTED` - Withdrawal rejected (refunds to withdrawable real balance)
- `WITHDRAW` - Agent/dealer withdrawal from user (credits to agent/dealer, debits from user)

#### Game Transactions
- `TICKET_BORLETTE` - Borlette ticket purchase
- `TICKET_MEGAMILLION` - MegaMillion ticket purchase
- `TICKET_ROULETTE` - Roulette ticket/bet
- `ROULETTE_BET` - Roulette bet
- `DOMINO_ENTRY` - Domino game entry

#### Winning Transactions
- `WON_BORLETTE` - Borlette winnings (credits to withdrawable real balance)
- `WON_MEGAMILLION` - MegaMillion winnings (credits to withdrawable real balance)
- `WON_ROULETTE` - Roulette winnings (credits to withdrawable real balance)
- `WON_DOMINO` - Domino winnings (credits to withdrawable real balance)

#### Commission Transactions
- `TICKET_BORLETTE_COMMISSION` - Borlette ticket commission
- `TICKET_MEGAMILLION_COMMISSION` - MegaMillion ticket commission
- `DOMINO_ENTRY_COMMISSION` - Domino entry commission
- `WON_DOMINO_COMMISSION` - Domino winning commission
- `ROULETTE_BET_COMMISSION` - Roulette bet commission
- `DEPOSIT_COMMISSION` - Deposit commission
- `WITHDRAW_COMMISSION` - Withdrawal commission
- `REFERRAL_COMMISSION` - Referral commission (credits to withdrawable real balance)
- `TRANSFER_COMMISION` - Transfer commission

#### Cancellation & Refund Transactions
- `TICKET_BORLETTE_CANCELLED` - Borlette ticket cancelled (refunds to non-withdrawable real balance)
- `TICKET_MEGAMILLION_CANCELLED` - MegaMillion ticket cancelled
- `ROULETTE_BET_CANCELLED` - Roulette bet cancelled
- `DOMINO_REFUND` - Domino entry refund
- `TICKET_BORLETTE_COMMISSION_CANCELLED` - Borlette commission reversal
- `TICKET_MEGAMILLION_COMMISSION_CANCELLED` - MegaMillion commission reversal
- `DOMINO_REFUND_COMMISSION` - Domino refund commission reversal

#### Loyalty Transactions
- `CASHBACK` - Cashback reward (credits to non-withdrawable real balance)

#### Legacy/General Transactions
- `DEPOSIT` - General deposit transaction

### Cash Type Behavior

#### REAL Cash Type
- **Credits to Non-Withdrawable**: Purchases, wire transfers, cashback, refunds
- **Credits to Withdrawable**: Winnings, referral commissions, agent commissions, withdrawal rejections
- **Debits from**: Game purchases (non-withdrawable first, then withdrawable), withdrawals (withdrawable only)

#### VIRTUAL Cash Type
- **Credits to**: Virtual balance
- **Debits from**: Virtual balance
- **Cannot be withdrawn**: Virtual cash is for gameplay only

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Error message describing the issue"
}
```

**Common 400 errors:**
- Invalid parameters
- Invalid amount type
- Invalid transaction type
- Transaction already processed
- Insufficient balance

#### 401 Unauthorized
```
401 Unauthorized
```
- Missing or invalid authentication token
- Token expired

#### 403 Forbidden
```json
{
  "success": false,
  "error": "You are not authorized to perform this action."
}
```
- Insufficient role permissions
- Attempting to access another user's transactions (non-ADMIN users)

#### 404 Not Found
```json
{
  "success": false,
  "error": "Transaction not found"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Error message"
}
```

**Common 500 errors:**
- Database errors
- Wallet not found
- Transaction processing failures
- Insufficient balance errors

---

## Best Practices

### Transaction Processing

1. **Two-Step Process**: Use `/initiate` to create a pending transaction, then `/process` to complete it
2. **Balance Validation**: Always check balance before processing withdrawals
3. **Error Handling**: Implement retry logic for failed transactions
4. **Idempotency**: Use transaction IDs to prevent duplicate processing

### Query Optimization

1. **Pagination**: Always use `limit` and `offset` for large result sets
2. **Date Filtering**: Use date ranges to limit query scope
3. **Filtering**: Apply filters at the API level rather than filtering client-side
4. **Sorting**: Use appropriate sort fields for better performance

### Cash Type Selection

1. **REAL Cash**: Use for actual money transactions, withdrawals, winnings
2. **VIRTUAL Cash**: Use for gameplay, bonuses, promotional credits
3. **Withdrawals**: Only REAL cash can be withdrawn

### Security

1. **Role-Based Access**: Respect role restrictions (ADMIN, AGENT, DEALER)
2. **User Isolation**: Non-ADMIN users can only access their own transactions
3. **Token Management**: Store and refresh tokens securely
4. **HTTPS**: Always use HTTPS for API calls

---

## Rate Limiting

- Transaction endpoints are rate-limited to prevent abuse
- Commission and analytics endpoints have stricter rate limits
- Contact support for higher rate limits if needed

---

## Support

For API support or questions, please contact the development team or refer to the main API documentation.

---

## Changelog

### Version 1.0.0
- Initial API documentation
- Transaction initiation and processing
- Transaction listing and filtering
- Transaction summaries
- Support for REAL and VIRTUAL cash types

### Version 1.1.0
- Admin-only endpoints moved to `/api/admin/transaction-management`
