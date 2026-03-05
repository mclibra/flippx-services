# Withdrawal API

REST API endpoints for users to initiate withdrawal requests and view their withdrawal history. Withdrawals require admin approval and are processed through Rapyd payment gateway.

---

## Quick Reference

| Area | What's Covered |
| --- | --- |
| [User Endpoints](#user-endpoints) | Initiate withdrawal, view history, and cancel pending withdrawals |
| [Withdrawal Process](#withdrawal-process) | Complete withdrawal lifecycle |
| [Data Models](#data-models) | Withdrawal schema structure |
| [Usage Examples](#usage-examples) | End-to-end workflow examples |
| [Error Handling](#error-handling) | Common errors and status codes |

---

## User Endpoints

All user endpoints require:
- **Authentication**: Bearer token in Authorization header
- **Headers**: `x-api-key` header required

---

### 1. Initiate Withdrawal

Create a new withdrawal request. The withdrawal will be in `PENDING` status until approved by an admin.

**Endpoint:** `POST /api/withdrawals`

**Authentication:** Required (User token)

**Request Body:**
```json
{
  "amount": 100.00,
  "bankAccountId": "507f1f77bcf86cd799439011"
}
```

**Request Parameters:**
- `amount` (Number, required): Withdrawal amount (must be > 0)
- `bankAccountId` (String, required): Bank account ID (must belong to the authenticated user)

**Success Response (200):**
```json
{
  "success": true,
  "withdrawal": {
    "_id": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439012",
    "bankAccount": "507f1f77bcf86cd799439013",
    "amount": 100.00,
    "fee": 0,
    "netAmount": 100.00,
    "status": "PENDING",
    "requestDate": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Withdrawal initiated and pending approval"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid withdrawal amount"
}
```

```json
{
  "success": false,
  "error": "Bank account is required"
}
```

```json
{
  "success": false,
  "error": "Withdrawal amount exceeds your weekly limit. Available: $50, Requested: $100",
  "availableAmount": 50,
  "weeklyLimit": 500,
  "usedAmount": 450,
  "resetDate": "2024-01-22T00:00:00.000Z"
}
```

```json
{
  "success": false,
  "error": "Insufficient withdrawable real cash balance",
  "availableWithdrawable": 25.50,
  "totalReal": 150.00
}
```

```json
{
  "success": false,
  "error": "Invalid bank account"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to validate withdrawal limits. Please try again."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/withdrawals \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "amount": 100.00,
    "bankAccountId": "507f1f77bcf86cd799439011"
  }'
```

**Validation Rules:**
1. Amount must be greater than 0
2. Bank account must exist and belong to the authenticated user
3. User must have sufficient `realBalanceWithdrawable` balance
4. Amount must not exceed weekly withdrawal limit (based on user's loyalty tier)
5. Creates a `WITHDRAWAL_PENDING` transaction that deducts from withdrawable balance

**Notes:**
- The withdrawal amount is immediately deducted from `realBalanceWithdrawable` and added to `pendingWithdrawals`
- Withdrawal fee is currently set to 0 (no fee)
- `netAmount` = `amount` - `fee`
- Withdrawal status starts as `PENDING` and requires admin approval

---

### 2. Get User Withdrawals

Retrieve paginated list of withdrawals for the authenticated user.

**Endpoint:** `GET /api/withdrawals`

**Authentication:** Required (User token)

**Query Parameters:**
- `limit` (Number, optional, default: 10): Number of records per page
- `offset` (Number, optional, default: 0): Pagination offset
- `status` (String, optional): Filter by status (PENDING, PROCESSING, COMPLETED, REJECTED, FAILED)

**Success Response (200):**
```json
{
  "success": true,
  "withdrawals": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "bankAccount": {
        "_id": "507f1f77bcf86cd799439013",
        "accountHolderName": "John Doe",
        "accountNumber": "****1234",
        "routingNumber": "****5678",
        "bankName": "Chase Bank",
        "accountType": "checking"
      },
      "amount": 100.00,
      "fee": 0,
      "netAmount": 100.00,
      "status": "PENDING",
      "requestDate": "2024-01-15T10:30:00.000Z",
      "processedDate": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "user": "507f1f77bcf86cd799439012",
      "bankAccount": {
        "_id": "507f1f77bcf86cd799439014",
        "accountHolderName": "John Doe",
        "accountNumber": "****5678",
        "routingNumber": "****9012",
        "bankName": "Bank of America",
        "accountType": "savings"
      },
      "amount": 250.00,
      "fee": 0,
      "netAmount": 250.00,
      "status": "COMPLETED",
      "requestDate": "2024-01-10T08:15:00.000Z",
      "processedDate": "2024-01-10T09:30:00.000Z",
      "paymentReference": "payout_123456789",
      "createdAt": "2024-01-10T08:15:00.000Z",
      "updatedAt": "2024-01-10T09:30:00.000Z"
    }
  ],
  "total": 2,
  "pagination": {
    "limit": 10,
    "offset": 0,
    "hasMore": false
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to get user withdrawals"
}
```

**Example:**
```bash
# Get all withdrawals
curl -X GET "https://your-api-domain.com/api/withdrawals" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get only pending withdrawals
curl -X GET "https://your-api-domain.com/api/withdrawals?status=PENDING&limit=20&offset=0" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Returns only withdrawals belonging to the authenticated user
- Results are sorted by creation date (newest first)
- Bank account details are populated in the response
- Status filter is case-insensitive (automatically converted to uppercase)
- Bank accounts must have a valid Rapyd beneficiary ID (created automatically when bank account is added)

---

### 3. Cancel Withdrawal

Cancel a pending withdrawal request. This will cancel the withdrawal and automatically refund the amount to the user's wallet.

**Endpoint:** `DELETE /api/withdrawals/:id`

**Authentication:** Required (User token)

**URL Parameters:**
- `id` (String, required): Withdrawal ID

**Success Response (200):**
```json
{
  "success": true,
  "withdrawal": {
    "_id": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439012",
    "bankAccount": "507f1f77bcf86cd799439013",
    "amount": 100.00,
    "fee": 0,
    "netAmount": 100.00,
    "status": "REJECTED",
    "requestDate": "2024-01-15T10:30:00.000Z",
    "processedDate": "2024-01-15T11:00:00.000Z",
    "rejectionReason": "Cancelled by user",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "message": "Withdrawal cancelled and amount refunded"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Withdrawal not found"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "Unauthorized - This withdrawal does not belong to you"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Cannot cancel withdrawal with status: PROCESSING. Only PENDING withdrawals can be cancelled."
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to cancel withdrawal"
}
```

**Example:**
```bash
curl -X DELETE https://your-api-domain.com/api/withdrawals/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Validation Rules:**
1. Withdrawal must exist
2. Withdrawal must belong to the authenticated user
3. Withdrawal must be in `PENDING` status (cannot cancel PROCESSING, COMPLETED, REJECTED, or FAILED withdrawals)

**Process Flow:**
1. Validates withdrawal exists and belongs to the authenticated user
2. Checks withdrawal is in `PENDING` status
3. Updates withdrawal status to `REJECTED` with reason "Cancelled by user"
4. Creates `WITHDRAWAL_REJECTED` transaction (refunds amount to user's `realBalanceWithdrawable`)
5. Updates original `WITHDRAWAL_PENDING` transaction status to `REJECTED`

**Notes:**
- Only withdrawals with status `PENDING` can be cancelled
- Once a withdrawal is approved (status becomes `PROCESSING`), it cannot be cancelled by the user
- Cancelled withdrawals are marked as `REJECTED` with reason "Cancelled by user"
- Amount is automatically refunded to user's `realBalanceWithdrawable`
- Original transaction status is updated to `REJECTED`
- User can see the cancellation in their withdrawal history

---

## Withdrawal Process

### Lifecycle Flow

1. **User Initiates Withdrawal** (`POST /api/withdrawals`)
   - Validates amount, balance, and bank account
   - Checks weekly withdrawal limit (based on loyalty tier)
   - Creates withdrawal record with status `PENDING`
   - Deducts amount from `realBalanceWithdrawable`
   - Creates `WITHDRAWAL_PENDING` transaction

2. **User Cancels Withdrawal** (`DELETE /api/withdrawals/:id`) - Optional
   - User can cancel their own pending withdrawal
   - Status changes to `REJECTED` with reason "Cancelled by user"
   - Creates `WITHDRAWAL_REJECTED` transaction
   - Amount is refunded to user's `realBalanceWithdrawable`
   - Updates original transaction status to `REJECTED`
   - **Note:** Only `PENDING` withdrawals can be cancelled

3. **Admin Reviews** (See Admin Withdrawal Management API)
   - Admin can view all pending withdrawals
   - Admin can approve or reject withdrawal

4. **Admin Approves** (`POST /api/admin/withdrawal-management/:id/approve`)
   - Status changes to `PROCESSING`
   - Uses Rapyd beneficiary ID from bank account (created when bank account was added)
   - Creates payout in Rapyd using the beneficiary ID
   - Updates transaction status to `WITHDRAWAL_APPROVED`
   - Funds are transferred to user's bank account via Rapyd
   - **Note:** Once approved, withdrawal cannot be cancelled by user

5. **Admin Rejects** (`POST /api/admin/withdrawal-management/:id/reject`)
   - Status changes to `REJECTED`
   - Creates `WITHDRAWAL_REJECTED` transaction
   - Amount is refunded to user's `realBalanceWithdrawable`
   - Updates original transaction status to `REJECTED`

6. **Completion**
   - Rapyd processes the payout
   - Status may change to `COMPLETED` or `FAILED` based on Rapyd response
   - User receives funds in their bank account

### Withdrawal Statuses

| Status | Description | User Actions |
| --- | --- | --- |
| `PENDING` | Initial status when user creates withdrawal request | Can cancel |
| `PROCESSING` | Admin approved, payout initiated with Rapyd | Cannot cancel |
| `COMPLETED` | Payout completed successfully | Cannot cancel |
| `REJECTED` | Admin rejected or user cancelled the withdrawal | Cannot cancel |
| `FAILED` | Payout failed (Rapyd error or other issues) | Cannot cancel |
| `APPROVED` | Legacy status (not used in current flow) | Cannot cancel |

---

## Data Models

### Withdrawal Model

```typescript
{
  _id: ObjectId,
  user: String (ref: 'User'), // Required - User who requested withdrawal
  bankAccount: ObjectId (ref: 'BankAccount'), // Required - Bank account for payout
  amount: Number, // Required - Requested withdrawal amount
  fee: Number, // Default: 0 - Withdrawal fee
  netAmount: Number, // Required - Amount after fees (amount - fee)
  status: String (enum), // Default: 'PENDING' - Current status
  requestDate: Date, // Default: Date.now - When withdrawal was requested
  processedDate: Date, // Optional - When admin processed (approved/rejected)
  approvedBy: String (ref: 'User'), // Optional - Admin who processed
  rejectionReason: String, // Optional - Reason if rejected
  paymentReference: String, // Optional - Rapyd payout ID
  paymentDetails: Object, // Optional - Rapyd beneficiary and payout details
  createdAt: Date, // Auto-generated timestamp
  updatedAt: Date // Auto-generated timestamp
}
```

**Status Enum:** `['PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED']`

**Indexes:**
- `{ user: 1, createdAt: -1 }` - For efficient user withdrawal queries
- `{ status: 1, createdAt: -1 }` - For admin filtering by status

---

## Usage Examples

### Complete Workflow: Requesting a Withdrawal

1. **Check Available Balance:**
   - User should check their `realBalanceWithdrawable` balance before requesting withdrawal
   - This can be done via the wallet API

2. **Verify Bank Account:**
   - Ensure user has a valid bank account registered
   - Bank account must belong to the authenticated user

3. **Initiate Withdrawal:**
```bash
curl -X POST https://your-api-domain.com/api/withdrawals \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "amount": 100.00,
    "bankAccountId": "507f1f77bcf86cd799439011"
  }'
```

4. **Check Withdrawal Status:**
```bash
curl -X GET "https://your-api-domain.com/api/withdrawals?status=PENDING" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

5. **Cancel Withdrawal (Optional):**
   - If user wants to cancel before admin approval:
```bash
curl -X DELETE https://your-api-domain.com/api/withdrawals/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

6. **Monitor Processing:**
   - User can check withdrawal status periodically
   - Once status changes to `PROCESSING`, payout has been initiated and cannot be cancelled
   - Once status changes to `COMPLETED`, funds should arrive in bank account

### Handling Weekly Limit Errors

If withdrawal exceeds weekly limit:
```json
{
  "success": false,
  "error": "Withdrawal amount exceeds your weekly limit. Available: $50, Requested: $100",
  "availableAmount": 50,
  "weeklyLimit": 500,
  "usedAmount": 450,
  "resetDate": "2024-01-22T00:00:00.000Z"
}
```

**Response Fields:**
- `availableAmount`: Remaining amount user can withdraw this week
- `weeklyLimit`: Total weekly withdrawal limit for user's tier
- `usedAmount`: Amount already withdrawn this week
- `resetDate`: When the weekly limit resets

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation errors, insufficient balance, limit exceeded)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `500` - Internal Server Error

**Common Error Scenarios:**

1. **Invalid Amount:**
   ```json
   {
     "success": false,
     "error": "Invalid withdrawal amount"
   }
   ```

2. **Insufficient Balance:**
   ```json
   {
     "success": false,
     "error": "Insufficient withdrawable real cash balance",
     "availableWithdrawable": 25.50,
     "totalReal": 150.00
   }
   ```
   Note: `totalReal` includes both withdrawable and non-withdrawable balances

3. **Weekly Limit Exceeded:**
   ```json
   {
     "success": false,
     "error": "Withdrawal amount exceeds your weekly limit. Available: $50, Requested: $100",
     "availableAmount": 50,
     "weeklyLimit": 500,
     "usedAmount": 450,
     "resetDate": "2024-01-22T00:00:00.000Z"
   }
   ```

4. **Invalid Bank Account:**
   ```json
   {
     "success": false,
     "error": "Invalid bank account"
   }
   ```
   This occurs when:
   - Bank account doesn't exist
   - Bank account doesn't belong to the authenticated user

---

## Notes

- **Balance Types**: Only `realBalanceWithdrawable` can be withdrawn. `realBalanceNonWithdrawable` cannot be withdrawn directly.
- **Weekly Limits**: Withdrawal limits are based on user's loyalty tier and reset weekly.
- **Admin Approval**: All withdrawals require admin approval before processing.
- **User Cancellation**: Users can cancel their own pending withdrawals. Once a withdrawal is approved (status becomes `PROCESSING`), it cannot be cancelled by the user.
- **Payment Gateway**: Approved withdrawals are processed through Rapyd payment gateway.
- **Bank Account Beneficiaries**: Bank accounts are automatically registered as Rapyd beneficiaries when added (see [Bank Account API](../bank_account/README.md)). The beneficiary ID is stored in the bank account record and reused for all withdrawals.
- **Transaction Tracking**: All withdrawals create transaction records for audit purposes.
- **Refunds**: Rejected or cancelled withdrawals automatically refund the amount to user's `realBalanceWithdrawable`.
- **Processing Time**: Once approved, payouts typically take 1-3 business days to reach the bank account.

---

## Testing Checklist

- [ ] Initiate withdrawal with valid amount and bank account
- [ ] Initiate withdrawal with invalid amount (should fail)
- [ ] Initiate withdrawal with insufficient balance (should fail)
- [ ] Initiate withdrawal exceeding weekly limit (should fail)
- [ ] Initiate withdrawal with invalid bank account (should fail)
- [ ] Initiate withdrawal with bank account belonging to another user (should fail)
- [ ] Get user withdrawals list
- [ ] Filter withdrawals by status
- [ ] Paginate withdrawals with limit and offset
- [ ] Cancel pending withdrawal (should succeed)
- [ ] Cancel withdrawal that doesn't belong to user (should fail with 403)
- [ ] Cancel withdrawal with non-PENDING status (should fail with 400)
- [ ] Verify cancelled withdrawal refunds amount to wallet
- [ ] Verify cancelled withdrawal updates transaction status
- [ ] Verify withdrawal amount is deducted from balance immediately
- [ ] Verify withdrawal creates transaction record
- [ ] Verify weekly limit calculation is correct
- [ ] Verify error messages are descriptive and helpful
