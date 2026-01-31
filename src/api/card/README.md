# Card API

REST API endpoints for users to manage their payment cards. Cards are automatically registered as beneficiaries in Rapyd payment gateway when created, enabling seamless payout processing.

---

## Quick Reference

| Area                                    | What's Covered                                   |
| --------------------------------------- | ------------------------------------------------ |
| [User Endpoints](#user-endpoints)       | Add, list, set default, update, and remove cards |
| [Rapyd Integration](#rapyd-integration) | Automatic beneficiary creation process           |
| [Data Models](#data-models)             | Card schema structure                            |
| [Usage Examples](#usage-examples)       | End-to-end workflow examples                     |
| [Error Handling](#error-handling)       | Common errors and status codes                   |

---

## User Endpoints

All user endpoints require:

-   **Authentication**: Bearer token in Authorization header
-   **Headers**: `x-api-key` header required

---

## 1. Add Card

Create a new payment card. The system automatically checks card eligibility for payout before creating the card. Only cards that support Account Funding Transactions (AFT) can be added. The system automatically creates a Rapyd beneficiary when the card is added, enabling immediate use for withdrawals.

**Endpoint:** `POST /api/cards`

**Authentication:** Required (User token)

**Request Body:**

```json
{
	"cardholderName": "John Doe",
	"cardNumber": "4111111111111111",
	"expirationMonth": "11",
	"expirationYear": "34",
	"cvv": "123",
	"payoutMethodType": "xx_mastercardglobal_card"
}
```

**Request Parameters:**

-   `cardholderName` (String, required): Name on the card
-   `cardNumber` (String, required): Card number (13-19 digits)
-   `expirationMonth` (String, required): Expiration month (01-12)
-   `expirationYear` (String, required): Expiration year (2 or 4 digits, e.g., "34" or "2034")
-   `cvv` (String, required): CVV/CVC code (3-4 digits)
-   `payoutMethodType` (String, optional): Payout method type (e.g., "xx_mastercardglobal_card", "us_visa_card")

**Card Eligibility Check:**
Before creating the card, the system automatically checks if the card is eligible for payout using Rapyd's card eligibility API. The card must support Account Funding Transactions (AFT) - either domestic or international - to be eligible for payout. Cards that do not support AFT will be rejected with an error message.

**Success Response (200):**

```json
{
	"success": true,
	"card": {
		"_id": "507f1f77bcf86cd799439011",
		"user": "507f1f77bcf86cd799439012",
		"cardholderName": "John Doe",
		"expirationMonth": "11",
		"expirationYear": "34",
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
If beneficiary creation fails but card is saved:

```json
{
	"success": true,
	"card": {
		"_id": "507f1f77bcf86cd799439011",
		"cardholderName": "John Doe",
		"expirationMonth": "11",
		"expirationYear": "34",
		"isDefault": true,
		"rapydBeneficiaryId": null,
		"rapydBeneficiaryError": "Failed to create beneficiary: Invalid card details"
	},
	"warning": "Card created but beneficiary creation failed. Please contact support.",
	"beneficiaryError": "Failed to create beneficiary: Invalid card details"
}
```

**Error Response (400):**

```json
{
	"success": false,
	"error": "All card fields are required"
}
```

```json
{
	"success": false,
	"error": "Expiration month must be between 1 and 12"
}
```

```json
{
	"success": false,
	"error": "Card has expired"
}
```

**Error Response (500):**

```json
{
	"success": false,
	"error": "Failed to add card"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/cards \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "cardholderName": "John Doe",
    "cardNumber": "4111111111111111",
    "expirationMonth": "11",
    "expirationYear": "34",
    "cvv": "123",
    "payoutMethodType": "xx_mastercardglobal_card"
  }'
```

**Validation Rules:**

1. All fields are required
2. `expirationMonth` must be between 1 and 12
3. `expirationYear` must not be in the past
4. Card must be eligible for payout (supports Account Funding Transactions - AFT)
5. First card added is automatically set as default
6. Card is immediately registered as a Rapyd beneficiary after eligibility check

**Notes:**

-   Card eligibility is checked before creating the card using Rapyd's card eligibility API
-   Only cards that support Account Funding Transactions (AFT) - domestic or international - can be added
-   The card is automatically registered as a Rapyd beneficiary upon creation (after eligibility check)
-   If beneficiary creation fails, the card is still saved but cannot be used for withdrawals until the issue is resolved
-   The `rapydBeneficiaryId` field stores the Rapyd beneficiary ID for payout processing
-   The `rapydBeneficiaryError` field stores any error messages if beneficiary creation fails
-   Card numbers and CVV are masked in responses for security

---

## 2. Get Cards

Retrieve all cards for the authenticated user.

**Endpoint:** `GET /api/cards`

**Authentication:** Required (User token)

**Success Response (200):**

```json
{
	"success": true,
	"cards": [
		{
			"_id": "507f1f77bcf86cd799439011",
			"cardholderName": "John Doe",
			"expirationMonth": "11",
			"expirationYear": "34",
			"isDefault": true,
			"isVerified": false,
			"rapydBeneficiaryId": "beneficiary_7e4912f745a5fa9cdfc9f457c9bb44f7",
			"rapydBeneficiaryError": null,
			"createdAt": "2024-01-15T10:30:00.000Z",
			"updatedAt": "2024-01-15T10:30:00.000Z"
		},
		{
			"_id": "507f1f77bcf86cd799439012",
			"cardholderName": "John Doe",
			"expirationMonth": "05",
			"expirationYear": "36",
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

**Note:** Card numbers and CVV are masked in the response for security (only last 4 digits shown as `maskedCardNumber`).

**Example:**

```bash
curl -X GET https://your-api-domain.com/api/cards \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3. Set Default Card

Set a card as the default card for withdrawals.

**Endpoint:** `PUT /api/cards/:id/default`

**Authentication:** Required (User token)

**URL Parameters:**

-   `id` (String, required): Card ID

**Success Response (200):**

```json
{
	"success": true,
	"card": {
		"_id": "507f1f77bcf86cd799439012",
		"cardholderName": "John Doe",
		"expirationMonth": "05",
		"expirationYear": "36",
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
	"error": "Card not found"
}
```

**Example:**

```bash
curl -X PUT https://your-api-domain.com/api/cards/507f1f77bcf86cd799439012/default \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**

-   Setting a card as default automatically removes the default flag from all other cards
-   Only one card can be default at a time
-   The default card is typically used for withdrawals if no specific card is selected

---

## 4. Update Card

Update card details (cardholder name, expiration date). Note: Card number and CVV cannot be updated for security reasons.

**Endpoint:** `PUT /api/cards/:id`

**Authentication:** Required (User token)

**URL Parameters:**

-   `id` (String, required): Card ID

**Request Body:**

```json
{
	"cardholderName": "Jane Doe",
	"expirationMonth": "12",
	"expirationYear": "35"
}
```

**Request Parameters:**

-   `cardholderName` (String, optional): Updated name on the card
-   `expirationMonth` (String, optional): Updated expiration month (01-12)
-   `expirationYear` (String, optional): Updated expiration year (2 or 4 digits)

**Success Response (200):**

```json
{
	"success": true,
	"card": {
		"_id": "507f1f77bcf86cd799439011",
		"cardholderName": "Jane Doe",
		"expirationMonth": "12",
		"expirationYear": "35",
		"isDefault": true,
		"updatedAt": "2024-01-25T10:30:00.000Z"
	}
}
```

**Error Response (400):**

```json
{
	"success": false,
	"error": "Expiration month must be between 1 and 12"
}
```

```json
{
	"success": false,
	"error": "Card has expired"
}
```

**Error Response (404):**

```json
{
	"success": false,
	"error": "Card not found"
}
```

**Example:**

```bash
curl -X PUT https://your-api-domain.com/api/cards/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "cardholderName": "Jane Doe",
    "expirationMonth": "12",
    "expirationYear": "35"
  }'
```

**Notes:**

-   Card number and CVV cannot be updated for security reasons
-   If you need to change card number or CVV, delete the old card and add a new one
-   Expiration date validation ensures the card is not expired
-   Updating card details does not update the Rapyd beneficiary (beneficiary details are fixed at creation)

---

## 5. Remove Card

Delete a card. Cannot be removed if there are pending withdrawals associated with it.

**Endpoint:** `DELETE /api/cards/:id`

**Authentication:** Required (User token)

**URL Parameters:**

-   `id` (String, required): Card ID

**Success Response (200):**

```json
{
	"success": true,
	"message": "Card removed successfully"
}
```

**Error Response (400):**

```json
{
	"success": false,
	"error": "Cannot remove card with pending withdrawals"
}
```

**Error Response (404):**

```json
{
	"success": false,
	"error": "Card not found"
}
```

**Error Response (500):**

```json
{
	"success": false,
	"error": "Failed to remove card"
}
```

**Example:**

```bash
curl -X DELETE https://your-api-domain.com/api/cards/507f1f77bcf86cd799439012 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Validation Rules:**

1. Card must exist and belong to the authenticated user
2. Cannot remove card if there are pending, approved, or processing withdrawals
3. If the removed card was default, another card (if exists) is automatically set as default

**Notes:**

-   Card removal does not delete the associated Rapyd beneficiary
-   If you need to remove the Rapyd beneficiary, contact support or use Rapyd's API directly

---

## Rapyd Integration

### Card Eligibility Check

Before creating a card, the system checks if the card is eligible for payout using Rapyd's card eligibility API (`/v1/cards/eligibility`):

1. **Eligibility Check**: The system verifies if the card supports Account Funding Transactions (AFT)
2. **AFT Support**: The card must support either domestic or international AFT to be eligible for payout
3. **Rejection**: Cards that do not support AFT are rejected with an error message before card creation

### Automatic Beneficiary Creation

When a card is added (after passing eligibility check), the system automatically creates a beneficiary in Rapyd payment gateway using the following process:

1. **Required Fields Fetch**: If `payoutMethodType` is provided, the system fetches required fields from Rapyd's API (`/v1/payment_methods/{payment_method_type}/required_fields`)
2. **Beneficiary Creation**: Upon card creation, the system calls Rapyd's `/v1/payouts/beneficiary` endpoint with only allowed fields
3. **Data Mapping**: User information and card details are mapped to Rapyd's beneficiary structure:

    - User name → `first_name`, `last_name`
    - User email → `email`
    - User phone → `phone_number`
    - User country code → `country` (normalized to ISO format)
    - Card details → `card_number`, `card_expiration_month`, `card_expiration_year`, `card_cvv`
    - User address → `address`, `city`, `state`, `postcode`
    - User identification → `identification_type`, `identification_value`
    - Currency → Determined based on country (e.g., NGN for Nigeria, USD for US)

4. **Beneficiary Storage**: The Rapyd beneficiary ID is stored in `rapydBeneficiaryId` field
5. **Error Handling**: If beneficiary creation fails, the error is stored in `rapydBeneficiaryError` field, but the card is still saved

### Beneficiary Structure

The beneficiary is created with the following structure (matching Rapyd API requirements):

```json
{
	"category": "card",
	"country": "NG",
	"currency": "NGN",
	"entity_type": "individual",
	"first_name": "John",
	"last_name": "Doe",
	"email": "john@example.com",
	"phone_number": "+2341234567890",
	"card_number": "4111111111111111",
	"card_expiration_month": "11",
	"card_expiration_year": "34",
	"card_cvv": "123",
	"payment_type": "priority",
	"address": "123 Main St",
	"city": "Lagos",
	"state": "Lagos",
	"postcode": "100001",
	"identification_type": "identification_id",
	"identification_value": "123456789",
	"merchant_reference_id": "507f1f77bcf86cd799439011",
	"default_payout_method_type": "xx_mastercardglobal_card"
}
```

**Important Notes:**

-   `payment_type`: Set to "priority" by default for card beneficiaries
-   The system fetches required fields from Rapyd's API (`/v1/payment_methods/{payment_method_type}/required_fields`) before creating the beneficiary
-   Only fields that are allowed by Rapyd for the specific payment method type are included in the request
-   Required fields are validated before beneficiary creation

### Required User Information

For successful beneficiary creation, ensure the user profile has:

-   **Name**: `firstName` and `lastName` (or `first` and `last`)
-   **Country Code**: `countryCode` or `address.country` (defaults to "US" if not provided)
-   **Address**: `address.address1`, `address.city`, `address.state`, `address.pincode` (defaults provided if missing)
-   **Identification**: `sim_nif` (defaults to "NOT_PROVIDED" if missing)

### Currency Mapping

The system automatically determines currency based on country:

-   Nigeria (NG) → NGN
-   United States (US) → USD
-   Other countries → USD (default)

---

## Data Models

### Card Schema

```javascript
{
  _id: ObjectId,                    // MongoDB document ID
  user: String,                     // Reference to User ID
  cardholderName: String,           // Name on card (required)
  cardNumber: String,                // Card number (required, stored encrypted)
  expirationMonth: String,           // Expiration month 01-12 (required)
  expirationYear: String,            // Expiration year 2 or 4 digits (required)
  cvv: String,                      // CVV code (required, stored encrypted)
  isDefault: Boolean,                // Default card flag (default: false)
  isVerified: Boolean,                // Verification status (default: false)
  verificationDate: Date,           // Date of verification (nullable)
  rapydBeneficiaryId: String,       // Rapyd beneficiary ID (nullable)
  rapydBeneficiaryError: String,    // Error message if beneficiary creation failed (nullable)
  createdAt: Date,                  // Creation timestamp
  updatedAt: Date                   // Last update timestamp
}
```

### Response Format

Card responses mask sensitive information:

-   `cardNumber` is hidden and replaced with `maskedCardNumber` (shows only last 4 digits)
-   `cvv` is completely removed from responses
-   `_id` is removed from JSON output (use `_id` from MongoDB document)

---

## Usage Examples

### Complete Workflow: Adding and Using a Card

**Step 1: Add Card**

```bash
curl -X POST https://your-api-domain.com/api/cards \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "cardholderName": "John Doe",
    "cardNumber": "4111111111111111",
    "expirationMonth": "11",
    "expirationYear": "34",
    "cvv": "123",
    "payoutMethodType": "xx_mastercardglobal_card"
  }'
```

**Response:**

```json
{
	"success": true,
	"card": {
		"_id": "507f1f77bcf86cd799439011",
		"cardholderName": "John Doe",
		"expirationMonth": "11",
		"expirationYear": "34",
		"isDefault": true,
		"rapydBeneficiaryId": "beneficiary_7e4912f745a5fa9cdfc9f457c9bb44f7"
	}
}
```

**Step 2: Use Card for Withdrawal**

```bash
curl -X POST https://your-api-domain.com/api/withdrawals \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "amount": 100.00,
    "cardId": "507f1f77bcf86cd799439011"
  }'
```

---

## Error Handling

### Common Error Codes

| Status Code | Error                                       | Description                                       |
| ----------- | ------------------------------------------- | ------------------------------------------------- |
| 400         | All card fields are required                | Missing required fields in request                |
| 400         | Expiration month must be between 1 and 12   | Invalid expiration month                          |
| 400         | Card has expired                            | Expiration date is in the past                    |
| 400         | Cannot remove card with pending withdrawals | Attempting to delete card with active withdrawals |
| 404         | Card not found                              | Card doesn't exist or doesn't belong to user      |
| 500         | Failed to add card                          | Server error during card creation                 |
| 500         | Failed to retrieve cards                    | Server error during retrieval                     |
| 500         | Failed to set default card                  | Server error during update                        |
| 500         | Failed to update card                       | Server error during update                        |
| 500         | Failed to remove card                       | Server error during deletion                      |

### Beneficiary Creation Errors

If beneficiary creation fails, the card is still saved but includes a warning:

```json
{
	"success": true,
	"card": {
		"rapydBeneficiaryId": null,
		"rapydBeneficiaryError": "Failed to create beneficiary: Invalid card details"
	},
	"warning": "Card created but beneficiary creation failed. Please contact support.",
	"beneficiaryError": "Failed to create beneficiary: Invalid card details"
}
```

**Common Beneficiary Errors:**

-   Invalid card number format
-   Expired card
-   Invalid CVV
-   Missing required address fields
-   Invalid country/currency combination
-   Rapyd API errors (network, authentication, etc.)

**Resolution:**

-   Verify card details are correct
-   Update user profile with missing information (address, identification)
-   Contact support if the error persists
-   Card can still be used after beneficiary is manually created

---

## Best Practices

1. **Complete User Profile**: Ensure user profile has complete address and identification information before adding cards
2. **Verify Beneficiary Status**: Check `rapydBeneficiaryId` after adding a card to ensure successful beneficiary creation
3. **Handle Errors Gracefully**: If beneficiary creation fails, inform the user and provide guidance on next steps
4. **Security**: Never expose full card numbers or CVV in API responses (already handled by masking)
5. **Default Card**: Set a default card for easier withdrawal processing
6. **Card Validation**: Validate card numbers and expiration dates before submission (client-side validation recommended)
7. **PCI Compliance**: Card data is stored securely and never exposed in logs or responses
8. **Expiration Monitoring**: Monitor card expiration dates and prompt users to update expired cards

---

## Related APIs

-   [Withdrawal API](../withdrawal/README.md) - Initiate withdrawals using cards
-   [Withdrawal Management API](../admin/withdrawal-management/README.md) - Admin approval and payout processing
-   [User API](../user/README.md) - User profile management (address, identification)
-   [Bank Account API](../bank_account/README.md) - Alternative payout method

---

## Support

For issues related to:

-   **Card Management**: Contact support team
-   **Rapyd Beneficiary Creation**: Check Rapyd dashboard or contact Rapyd support
-   **Withdrawal Processing**: See [Withdrawal Management API](../admin/withdrawal-management/README.md)
