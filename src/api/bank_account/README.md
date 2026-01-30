# Bank Account API

REST API endpoints for users to manage their bank accounts. Bank accounts are automatically registered as beneficiaries in Rapyd payment gateway when created, enabling seamless payout processing.

---

## Quick Reference

| Area | What's Covered |
| --- | --- |
| [User Endpoints](#user-endpoints) | Add, list, set default, and remove bank accounts |
| [Rapyd Integration](#rapyd-integration) | Automatic beneficiary creation process |
| [Data Models](#data-models) | Bank account schema structure |
| [Usage Examples](#usage-examples) | End-to-end workflow examples |
| [Error Handling](#error-handling) | Common errors and status codes |

---

## User Endpoints

All user endpoints require:
- **Authentication**: Bearer token in Authorization header
- **Headers**: `x-api-key` header required

---

## 1. Add Bank Account

Create a new bank account. The system automatically creates a Rapyd beneficiary when the bank account is added, enabling immediate use for withdrawals.

**Endpoint:** `POST /api/bank-accounts`

**Authentication:** Required (User token)

**Request Body (US Account):**
```json
{
  "bankName": "Chase Bank",
  "accountNumber": "1234567890",
  "accountHolderName": "John Doe",
  "routingNumber": "021000021",
  "accountType": "CHECKING"
}
```

**Request Body (International Account):**
```json
{
  "bankName": "Barclays Bank",
  "accountNumber": "12345678",
  "accountHolderName": "John Doe",
  "bicSwift": "BARCGB22XXX",
  "accountType": "CHECKING"
}
```

**Request Parameters:**
- `bankName` (String, required): Name of the bank
- `accountNumber` (String, required): Bank account number
- `accountHolderName` (String, required): Name on the bank account
- `routingNumber` (String, conditional): Bank routing number (9 digits for US banks) - Required for US accounts
- `bicSwift` (String, conditional): BIC/SWIFT code (8-11 characters) - Required for international (non-US) accounts
- `accountType` (String, required): Account type - must be `CHECKING` or `SAVINGS`

**Note:** Either `routingNumber` (for US accounts) or `bicSwift` (for international accounts) must be provided.

**Success Response (200):**
```json
{
  "success": true,
  "bankAccount": {
    "_id": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439012",
    "bankName": "Chase Bank",
    "accountNumber": "1234567890",
    "accountHolderName": "John Doe",
    "routingNumber": "021000021",
    "accountType": "CHECKING",
    "isDefault": true,
    "isVerified": false,
    "rapydBeneficiaryId": "beneficiary_7e4912f745a5fa9cdfc9f457c9bb44f7",
    "rapydBeneficiaryError": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Success Response with Warning (200):**
If beneficiary creation fails but bank account is saved:
```json
{
  "success": true,
  "bankAccount": {
    "_id": "507f1f77bcf86cd799439011",
    "bankName": "Chase Bank",
    "accountNumber": "1234567890",
    "accountHolderName": "John Doe",
    "routingNumber": "021000021",
    "accountType": "CHECKING",
    "isDefault": true,
    "rapydBeneficiaryId": null,
    "rapydBeneficiaryError": "Failed to create beneficiary: Invalid identification value"
  },
  "warning": "Bank account created but beneficiary creation failed. Please contact support.",
  "beneficiaryError": "Failed to create beneficiary: Invalid identification value"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "All bank account fields are required"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to add bank account"
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/bank-accounts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "bankName": "Chase Bank",
    "accountNumber": "1234567890",
    "accountHolderName": "John Doe",
    "routingNumber": "021000021",
    "accountType": "CHECKING"
  }'
```

**Validation Rules:**
1. Bank name, account number, account holder name, and account type are required
2. Either `routingNumber` (US accounts) or `bicSwift` (international accounts) must be provided
3. `accountType` must be either `CHECKING` or `SAVINGS`
4. First bank account added is automatically set as default
5. Bank account is immediately registered as a Rapyd beneficiary

**Notes:**
- The bank account is automatically registered as a Rapyd beneficiary upon creation
- If beneficiary creation fails, the bank account is still saved but cannot be used for withdrawals until the issue is resolved
- The `rapydBeneficiaryId` field stores the Rapyd beneficiary ID for payout processing
- The `rapydBeneficiaryError` field stores any error messages if beneficiary creation fails

---

## 2. Get Bank Accounts

Retrieve all bank accounts for the authenticated user.

**Endpoint:** `GET /api/bank-accounts`

**Authentication:** Required (User token)

**Success Response (200):**
```json
{
  "success": true,
  "bankAccounts": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "bankName": "Chase Bank",
      "accountHolderName": "John Doe",
      "routingNumber": "021000021",
      "accountType": "CHECKING",
      "isDefault": true,
      "isVerified": false,
      "rapydBeneficiaryId": "beneficiary_7e4912f745a5fa9cdfc9f457c9bb44f7",
      "rapydBeneficiaryError": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "bankName": "Bank of America",
      "accountHolderName": "John Doe",
      "routingNumber": "121000248",
      "accountType": "SAVINGS",
      "isDefault": false,
      "isVerified": false,
      "rapydBeneficiaryId": "beneficiary_8f5a2e3b456c7d8e9f0a1b2c3d4e5f6",
      "rapydBeneficiaryError": null,
      "createdAt": "2024-01-20T14:20:00.000Z",
      "updatedAt": "2024-01-20T14:20:00.000Z"
    }
  ]
}
```

**Note:** Account numbers are masked in the response for security (only last 4 digits shown as `maskedAccountNumber`).

**Example:**
```bash
curl -X GET https://your-api-domain.com/api/bank-accounts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3. Set Default Bank Account

Set a bank account as the default account for withdrawals.

**Endpoint:** `PUT /api/bank-accounts/:id/default`

**Authentication:** Required (User token)

**URL Parameters:**
- `id` (String, required): Bank account ID

**Success Response (200):**
```json
{
  "success": true,
  "bankAccount": {
    "_id": "507f1f77bcf86cd799439012",
    "bankName": "Bank of America",
    "accountHolderName": "John Doe",
    "routingNumber": "121000248",
    "accountType": "SAVINGS",
    "isDefault": true,
    "isVerified": false,
    "rapydBeneficiaryId": "beneficiary_8f5a2e3b456c7d8e9f0a1b2c3d4e5f6",
    "createdAt": "2024-01-20T14:20:00.000Z",
    "updatedAt": "2024-01-20T15:30:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Bank account not found"
}
```

**Example:**
```bash
curl -X PUT https://your-api-domain.com/api/bank-accounts/507f1f77bcf86cd799439012/default \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Setting a bank account as default automatically removes the default flag from all other bank accounts
- Only one bank account can be default at a time
- The default bank account is typically used for withdrawals if no specific account is selected

---

## 4. Remove Bank Account

Delete a bank account. Cannot be removed if there are pending withdrawals associated with it.

**Endpoint:** `DELETE /api/bank-accounts/:id`

**Authentication:** Required (User token)

**URL Parameters:**
- `id` (String, required): Bank account ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Bank account removed successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Cannot remove bank account with pending withdrawals"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Bank account not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to remove bank account"
}
```

**Example:**
```bash
curl -X DELETE https://your-api-domain.com/api/bank-accounts/507f1f77bcf86cd799439012 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Validation Rules:**
1. Bank account must exist and belong to the authenticated user
2. Cannot remove bank account if there are pending, approved, or processing withdrawals
3. If the removed account was default, another account (if exists) is automatically set as default

**Notes:**
- Bank account removal does not delete the associated Rapyd beneficiary
- If you need to remove the Rapyd beneficiary, contact support or use Rapyd's API directly

---

## Rapyd Integration

### Automatic Beneficiary Creation

When a bank account is added, the system automatically creates a beneficiary in Rapyd payment gateway using the following process:

1. **Beneficiary Creation**: Upon bank account creation, the system calls Rapyd's `/v1/payouts/beneficiary` endpoint
2. **Data Mapping**: User information and bank account details are mapped to Rapyd's beneficiary structure:
   - User name → `first_name`, `last_name`
   - User email → `email`
   - User phone → `phone_number`
   - User country code → `country`
   - Bank account details → `bank_name`, `account_number`, `routing_number`
   - User address → `address`, `city`, `state`, `postcode`
   - User identification → `identification_type`, `identification_value`

3. **Beneficiary Storage**: The Rapyd beneficiary ID is stored in `rapydBeneficiaryId` field
4. **Error Handling**: If beneficiary creation fails, the error is stored in `rapydBeneficiaryError` field, but the bank account is still saved

### Beneficiary Structure

The beneficiary is created with the following structure (matching Rapyd API requirements):

```json
{
  "category": "bank",
  "bank_name": "Chase Bank",
  "country": "US",
  "currency": "USD",
  "entity_type": "individual",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone_number": "+1234567890",
  "account_number": "1234567890",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "postcode": "10001",
  "identification_type": "identification_id",
  "identification_value": "123456789",
  "merchant_reference_id": "507f1f77bcf86cd799439011"
}
```

### Required User Information

For successful beneficiary creation, ensure the user profile has:
- **Name**: `firstName` and `lastName` (or `first` and `last`)
- **Country Code**: `countryCode` (defaults to "US" if not provided)
- **Address**: `address.address1`, `address.city`, `address.state`, `address.pincode` (defaults provided if missing)
- **Identification**: `sim_nif` (defaults to "NOT_PROVIDED" if missing)

---

## Data Models

### Bank Account Schema

```javascript
{
  _id: ObjectId,                    // MongoDB document ID
  user: String,                     // Reference to User ID
  bankName: String,                 // Name of the bank (required)
  accountNumber: String,            // Bank account number (required)
  accountHolderName: String,        // Name on account (required)
  routingNumber: String,             // Bank routing number (required for US accounts)
  bicSwift: String,                  // BIC/SWIFT code (required for international accounts)
  accountType: String,              // "CHECKING" or "SAVINGS" (required)
  isDefault: Boolean,               // Default account flag (default: false)
  isVerified: Boolean,               // Verification status (default: false)
  verificationDate: Date,           // Date of verification (nullable)
  rapydBeneficiaryId: String,       // Rapyd beneficiary ID (nullable)
  rapydBeneficiaryError: String,    // Error message if beneficiary creation failed (nullable)
  createdAt: Date,                  // Creation timestamp
  updatedAt: Date                  // Last update timestamp
}
```

**Note:** Either `routingNumber` (US accounts) or `bicSwift` (international accounts) must be provided.

### Response Format

Bank account responses mask sensitive information:
- `accountNumber` is hidden and replaced with `maskedAccountNumber` (shows only last 4 digits)
- `_id` is removed from JSON output (use `_id` from MongoDB document)

---

## Usage Examples

### Complete Workflow: Adding and Using a Bank Account

**Step 1: Add Bank Account**
```bash
curl -X POST https://your-api-domain.com/api/bank-accounts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "bankName": "Chase Bank",
    "accountNumber": "1234567890",
    "accountHolderName": "John Doe",
    "routingNumber": "021000021",
    "accountType": "CHECKING"
  }'
```

**Response:**
```json
{
  "success": true,
  "bankAccount": {
    "_id": "507f1f77bcf86cd799439011",
    "bankName": "Chase Bank",
    "accountHolderName": "John Doe",
    "accountType": "CHECKING",
    "isDefault": true,
    "rapydBeneficiaryId": "beneficiary_7e4912f745a5fa9cdfc9f457c9bb44f7"
  }
}
```

**Step 2: Use Bank Account for Withdrawal**
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

---

## Error Handling

### Common Error Codes

| Status Code | Error | Description |
|------------|-------|-------------|
| 400 | All bank account fields are required | Missing required fields in request |
| 400 | Cannot remove bank account with pending withdrawals | Attempting to delete account with active withdrawals |
| 404 | Bank account not found | Bank account doesn't exist or doesn't belong to user |
| 500 | Failed to add bank account | Server error during bank account creation |
| 500 | Failed to retrieve bank accounts | Server error during retrieval |
| 500 | Failed to set default bank account | Server error during update |
| 500 | Failed to remove bank account | Server error during deletion |

### Beneficiary Creation Errors

If beneficiary creation fails, the bank account is still saved but includes a warning:

```json
{
  "success": true,
  "bankAccount": {
    "rapydBeneficiaryId": null,
    "rapydBeneficiaryError": "Failed to create beneficiary: Invalid identification value"
  },
  "warning": "Bank account created but beneficiary creation failed. Please contact support.",
  "beneficiaryError": "Failed to create beneficiary: Invalid identification value"
}
```

**Common Beneficiary Errors:**
- Invalid identification value
- Missing required address fields
- Invalid country/currency combination
- Rapyd API errors (network, authentication, etc.)

**Resolution:**
- Update user profile with missing information (address, identification)
- Contact support if the error persists
- Bank account can still be used after beneficiary is manually created

---

## Best Practices

1. **Complete User Profile**: Ensure user profile has complete address and identification information before adding bank accounts
2. **Verify Beneficiary Status**: Check `rapydBeneficiaryId` after adding a bank account to ensure successful beneficiary creation
3. **Handle Errors Gracefully**: If beneficiary creation fails, inform the user and provide guidance on next steps
4. **Security**: Never expose full account numbers in API responses (already handled by masking)
5. **Default Account**: Set a default account for easier withdrawal processing
6. **Account Validation**: Validate routing numbers and account numbers before submission (client-side validation recommended)

---

## Related APIs

- [Withdrawal API](../withdrawal/README.md) - Initiate withdrawals using bank accounts
- [Withdrawal Management API](../admin/withdrawal-management/README.md) - Admin approval and payout processing
- [User API](../user/README.md) - User profile management (address, identification)

---

## Support

For issues related to:
- **Bank Account Management**: Contact support team
- **Rapyd Beneficiary Creation**: Check Rapyd dashboard or contact Rapyd support
- **Withdrawal Processing**: See [Withdrawal Management API](../admin/withdrawal-management/README.md)
