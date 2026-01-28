# Withdrawal Management API (Admin)

REST API endpoints for administrators to manage withdrawal requests. Admins can view all withdrawals, approve pending requests (initiating payouts via Rapyd), and reject withdrawals (refunding amounts to users).

---

## Quick Reference

| Area | What's Covered |
| --- | --- |
| [Admin Endpoints](#admin-endpoints) | All admin-only operations |
| [Withdrawal Approval Process](#withdrawal-approval-process) | Complete approval workflow |
| [Data Models](#data-models) | Withdrawal schema structure |
| [Usage Examples](#usage-examples) | End-to-end workflow examples |
| [Error Handling](#error-handling) | Common errors and status codes |

---

## Admin Endpoints

All admin endpoints require:
- **Authentication**: Bearer token in Authorization header
- **Role**: ADMIN role required
- **Headers**: `x-api-key` header required

---

### 1. Get All Withdrawals

Retrieve paginated list of all withdrawals with filtering options. Useful for admin dashboard and withdrawal management.

**Endpoint:** `GET /api/admin/withdrawal-management`

**Authentication:** Required (ADMIN role)

**Query Parameters:**
- `limit` (Number, optional, default: 20): Number of records per page
- `offset` (Number, optional, default: 0): Pagination offset
- `status` (String, optional): Filter by status (PENDING, PROCESSING, COMPLETED, REJECTED, FAILED)
- `userId` (String, optional): Filter by specific user ID

**Success Response (200):**
```json
{
  "success": true,
  "withdrawals": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "user": {
        "_id": "507f1f77bcf86cd799439012",
        "name": {
          "first": "John",
          "last": "Doe"
        },
        "phone": "+1234567890",
        "email": "john@example.com"
      },
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
      "approvedBy": null,
      "rejectionReason": null,
      "paymentReference": null,
      "paymentDetails": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439014",
      "user": {
        "_id": "507f1f77bcf86cd799439015",
        "name": {
          "first": "Jane",
          "last": "Smith"
        },
        "phone": "+1987654321",
        "email": "jane@example.com"
      },
      "bankAccount": {
        "_id": "507f1f77bcf86cd799439016",
        "accountHolderName": "Jane Smith",
        "accountNumber": "****5678",
        "routingNumber": "****9012",
        "bankName": "Bank of America",
        "accountType": "savings"
      },
      "amount": 250.00,
      "fee": 0,
      "netAmount": 250.00,
      "status": "PROCESSING",
      "requestDate": "2024-01-14T08:15:00.000Z",
      "processedDate": "2024-01-14T09:30:00.000Z",
      "approvedBy": {
        "_id": "507f191e810c19729de860ea",
        "name": {
          "first": "Admin",
          "last": "User"
        }
      },
      "rejectionReason": null,
      "paymentReference": "payout_123456789",
      "paymentDetails": {
        "rapydBeneficiaryId": "beneficiary_123",
        "rapydPayoutId": "payout_123456789",
        "rapydPayoutData": { /* Rapyd payout response */ }
      },
      "createdAt": "2024-01-14T08:15:00.000Z",
      "updatedAt": "2024-01-14T09:30:00.000Z"
    }
  ],
  "total": 2,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to get admin withdrawals"
}
```

**Example:**
```bash
# Get all withdrawals
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get only pending withdrawals
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?status=PENDING&limit=50" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get withdrawals for specific user
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?userId=507f1f77bcf86cd799439012" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- Results are sorted by creation date (newest first)
- User, bank account, and approvedBy fields are populated with relevant details
- Status filter is case-insensitive (automatically converted to uppercase)
- Useful for admin dashboard to show all withdrawal requests

---

### 2. Approve Withdrawal

Approve a pending withdrawal request. This will:
1. Create a beneficiary in Rapyd (if not already created)
2. Create a payout in Rapyd
3. Update withdrawal status to `PROCESSING`
4. Update transaction status to `WITHDRAWAL_APPROVED`

**Endpoint:** `POST /api/admin/withdrawal-management/:id/approve`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): Withdrawal ID

**Success Response (200):**
```json
{
  "success": true,
  "withdrawal": {
    "_id": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439012",
    "bankAccount": {
      "_id": "507f1f77bcf86cd799439013",
      "accountHolderName": "John Doe",
      "accountNumber": "1234567890",
      "routingNumber": "123456789",
      "bankName": "Chase Bank",
      "accountType": "checking"
    },
    "amount": 100.00,
    "fee": 0,
    "netAmount": 100.00,
    "status": "PROCESSING",
    "requestDate": "2024-01-15T10:30:00.000Z",
    "processedDate": "2024-01-15T11:00:00.000Z",
    "approvedBy": "507f191e810c19729de860ea",
    "rejectionReason": null,
    "paymentReference": "payout_123456789",
    "paymentDetails": {
      "rapydBeneficiaryId": "beneficiary_123",
      "rapydPayoutId": "payout_123456789",
      "rapydPayoutData": {
        "id": "payout_123456789",
        "status": "ACT",
        "amount": "100.00",
        "currency": "USD",
        /* ... other Rapyd payout fields ... */
      }
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "message": "Withdrawal approved and payout initiated successfully",
  "payoutId": "payout_123456789"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Withdrawal not found"
}
```

```json
{
  "success": false,
  "error": "User not found"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Withdrawal is not in pending status"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to create payout with Rapyd. Please try again."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/admin/withdrawal-management/507f1f77bcf86cd799439011/approve \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Process Flow:**
1. Validates admin permissions
2. Finds withdrawal and validates it's in `PENDING` status
3. Updates status to `PROCESSING`
4. Creates Rapyd beneficiary (if not exists) with bank account details
5. Creates Rapyd payout for `netAmount`
6. Updates withdrawal with Rapyd payout details
7. Updates transaction status from `WITHDRAWAL_PENDING` to `WITHDRAWAL_APPROVED`
8. If Rapyd operations fail, reverts status to `PENDING` and records error

**Notes:**
- Only withdrawals with status `PENDING` can be approved
- If Rapyd beneficiary already exists (from previous withdrawal), it's reused
- Rapyd payout is created for `netAmount` (amount after fees)
- If Rapyd operations fail, withdrawal status is reverted to `PENDING` for retry
- Transaction status is updated to reflect approval

---

### 3. Reject Withdrawal

Reject a pending withdrawal request. This will:
1. Update withdrawal status to `REJECTED`
2. Create `WITHDRAWAL_REJECTED` transaction
3. Refund the amount to user's `realBalanceWithdrawable`
4. Update original transaction status to `REJECTED`

**Endpoint:** `POST /api/admin/withdrawal-management/:id/reject`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): Withdrawal ID

**Request Body:**
```json
{
  "reason": "Insufficient verification documents"
}
```

**Request Parameters:**
- `reason` (String, optional): Reason for rejection (default: "Rejected by admin")

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
    "approvedBy": "507f191e810c19729de860ea",
    "rejectionReason": "Insufficient verification documents",
    "paymentReference": null,
    "paymentDetails": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "message": "Withdrawal rejected and amount refunded"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Withdrawal not found"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Withdrawal is not in pending status"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to reject withdrawal"
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/admin/withdrawal-management/507f1f77bcf86cd799439011/reject \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "reason": "Insufficient verification documents"
  }'
```

**Process Flow:**
1. Validates admin permissions
2. Finds withdrawal and validates it's in `PENDING` status
3. Updates status to `REJECTED` with rejection reason
4. Creates `WITHDRAWAL_REJECTED` transaction (refunds amount to user)
5. Updates original `WITHDRAWAL_PENDING` transaction status to `REJECTED`

**Notes:**
- Only withdrawals with status `PENDING` can be rejected
- Rejection reason is stored for audit purposes
- Amount is automatically refunded to user's `realBalanceWithdrawable`
- Original transaction status is updated to `REJECTED`
- User can see rejection reason in their withdrawal history

---

## Withdrawal Approval Process

### Complete Workflow

1. **User Initiates Withdrawal** (User API)
   - User creates withdrawal request via `POST /api/withdrawals`
   - Status: `PENDING`
   - Amount deducted from `realBalanceWithdrawable`

2. **Admin Reviews** (This API)
   - Admin views pending withdrawals via `GET /api/admin/withdrawal-management?status=PENDING`
   - Admin reviews user details, bank account, and amount

3. **Admin Decision:**

   **Option A: Approve**
   - Admin calls `POST /api/admin/withdrawal-management/:id/approve`
   - System creates Rapyd beneficiary (if needed)
   - System creates Rapyd payout
   - Status: `PROCESSING`
   - Transaction status: `WITHDRAWAL_APPROVED`
   - Funds are transferred via Rapyd

   **Option B: Reject**
   - Admin calls `POST /api/admin/withdrawal-management/:id/reject`
   - Status: `REJECTED`
   - Amount refunded to user's `realBalanceWithdrawable`
   - Transaction status: `WITHDRAWAL_REJECTED`

4. **Completion** (Handled by Rapyd)
   - Rapyd processes payout
   - Status may update to `COMPLETED` or `FAILED` based on Rapyd webhook/status

### Withdrawal Statuses

| Status | Description | Admin Actions Available |
| --- | --- | --- |
| `PENDING` | User created request, awaiting admin review | Approve, Reject |
| `PROCESSING` | Admin approved, payout initiated with Rapyd | None (monitor) |
| `COMPLETED` | Payout completed successfully | None |
| `REJECTED` | Admin rejected the withdrawal | None |
| `FAILED` | Payout failed (Rapyd error) | Review and potentially retry |

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
  paymentDetails: Object, // Optional - Contains:
    //   - rapydBeneficiaryId: String
    //   - rapydPayoutId: String
    //   - rapydPayoutData: Object (full Rapyd response)
  createdAt: Date, // Auto-generated timestamp
  updatedAt: Date // Auto-generated timestamp
}
```

**Status Enum:** `['PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED']`

**Indexes:**
- `{ status: 1, createdAt: -1 }` - For efficient admin filtering
- `{ user: 1, createdAt: -1 }` - For user-specific queries
- `{ approvedBy: 1, createdAt: -1 }` - For admin audit trail

---

## Usage Examples

### Complete Workflow: Approving a Withdrawal

1. **View Pending Withdrawals:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?status=PENDING" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

2. **Review Withdrawal Details:**
   - Check user information
   - Verify bank account details
   - Confirm withdrawal amount

3. **Approve Withdrawal:**
```bash
curl -X POST https://your-api-domain.com/api/admin/withdrawal-management/507f1f77bcf86cd799439011/approve \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

4. **Monitor Processing:**
   - Check withdrawal status periodically
   - Verify Rapyd payout was created successfully
   - Monitor for any Rapyd errors

### Rejecting a Withdrawal

```bash
curl -X POST https://your-api-domain.com/api/admin/withdrawal-management/507f1f77bcf86cd799439011/reject \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "reason": "Bank account verification failed"
  }'
```

### Filtering Withdrawals

```bash
# Get all pending withdrawals
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?status=PENDING" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get withdrawals for specific user
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?userId=507f1f77bcf86cd799439012" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get failed withdrawals
curl -X GET "https://your-api-domain.com/api/admin/withdrawal-management?status=FAILED" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

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
- `400` - Bad Request (withdrawal not in correct status)
- `403` - Forbidden (not admin role)
- `404` - Not Found (withdrawal/user not found)
- `500` - Internal Server Error (Rapyd errors, database errors)

**Common Error Scenarios:**

1. **Unauthorized Access:**
   ```json
   {
     "success": false,
     "error": "Unauthorized"
   }
   ```
   Occurs when non-admin user tries to access admin endpoints

2. **Withdrawal Not Found:**
   ```json
   {
     "success": false,
     "error": "Withdrawal not found"
   }
   ```

3. **Invalid Status:**
   ```json
   {
     "success": false,
     "error": "Withdrawal is not in pending status"
   }
   ```
   Occurs when trying to approve/reject a withdrawal that's not `PENDING`

4. **Rapyd Errors:**
   ```json
   {
     "success": false,
     "error": "Failed to create payout with Rapyd. Please try again."
   }
   ```
   If Rapyd operations fail during approval, withdrawal status is reverted to `PENDING`

---

## Notes

- **Admin Only**: All endpoints require ADMIN role
- **Rapyd Integration**: Approvals automatically create beneficiaries and payouts via Rapyd
- **Error Recovery**: Failed Rapyd operations revert withdrawal to `PENDING` status for retry
- **Transaction Tracking**: All approvals/rejections update transaction records
- **Refunds**: Rejected withdrawals automatically refund amounts to users
- **Audit Trail**: All actions are tracked with `approvedBy` and `processedDate` fields
- **Beneficiary Reuse**: Rapyd beneficiaries are reused if they already exist for a user
- **Processing Time**: Once approved, payouts typically take 1-3 business days via Rapyd

---

## Testing Checklist

- [ ] Get all withdrawals (admin)
- [ ] Filter withdrawals by status
- [ ] Filter withdrawals by user ID
- [ ] Paginate withdrawals with limit and offset
- [ ] Approve pending withdrawal
- [ ] Approve non-pending withdrawal (should fail)
- [ ] Approve non-existent withdrawal (should fail)
- [ ] Approve withdrawal with Rapyd error (should revert to PENDING)
- [ ] Reject pending withdrawal
- [ ] Reject non-pending withdrawal (should fail)
- [ ] Reject withdrawal with reason
- [ ] Reject withdrawal without reason (should use default)
- [ ] Verify rejected withdrawal refunds amount to user
- [ ] Verify approved withdrawal creates Rapyd beneficiary
- [ ] Verify approved withdrawal creates Rapyd payout
- [ ] Verify transaction status updates correctly
- [ ] Verify admin permissions are enforced
- [ ] Verify user details are populated correctly
- [ ] Verify bank account details are populated correctly
