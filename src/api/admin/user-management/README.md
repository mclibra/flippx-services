# Admin User Management API Documentation

Complete API documentation for admin user management operations including user CRUD, document verification, loyalty management, and bulk operations.

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [User List & Search](#user-list--search)
4. [User CRUD Operations](#user-crud-operations)
5. [Document Verification](#document-verification)
6. [Loyalty & Rewards Management](#loyalty--rewards-management)
7. [Account Management](#account-management)
8. [Bulk Operations](#bulk-operations)
9. [Data Export](#data-export)
10. [Error Handling](#error-handling)

---

## Base URL

All endpoints are prefixed with `/api/admin/users`

```
Base URL: https://your-api-domain.com/api/admin/users
```

---

## Authentication

All endpoints require ADMIN role authentication.

### Headers Required

```
Content-Type: application/json
x-api-key: YOUR_API_KEY
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## User List & Search

### 1. Get User List

Get paginated list of users with advanced search and filtering capabilities.

**Endpoint:** `GET /api/admin/users`

**Authentication:** Required (ADMIN role)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | Number | No | 1 | Page number |
| `limit` | Number | No | 20 | Items per page |
| `search` | String | No | - | Search by username, email, phone, first name, or last name |
| `status` | String | No | - | Filter by account status: `active`, `suspended`, `banned` |
| `loyaltyTier` | String | No | - | Filter by loyalty tier: `BRONZE`, `SILVER`, `GOLD`, `VIP` |
| `verificationStatus` | String | No | - | Filter by verification: `verified`, `unverified`, `pending` |
| `registrationStartDate` | String | No | - | Filter by registration date range start (ISO 8601) |
| `registrationEndDate` | String | No | - | Filter by registration date range end (ISO 8601) |
| `lastLoginStartDate` | String | No | - | Filter by last login date range start (ISO 8601) |
| `lastLoginEndDate` | String | No | - | Filter by last login date range end (ISO 8601) |
| `country` | String | No | - | Filter by country name |
| `role` | String | No | - | Filter by user role: `USER`, `ADMIN`, `DEALER`, `AGENT`, `SYSTEM` |
| `sortBy` | String | No | `createdAt` | Sort field |
| `sortOrder` | String | No | `desc` | Sort order: `asc` or `desc` |

**Success Response (200):**

```json
{
  "success": true,
  "users": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "userName": "johndoe123",
      "email": "john.doe@example.com",
      "phone": "1234567890",
      "countryCode": "+1",
      "countryName": "United States",
      "countryISO": "US",
      "role": "USER",
      "isActive": true,
      "address": {
        "country": "United States"
      },
      "wallet": {
        "virtualBalance": 1000.50,
        "realBalance": 500.25,
        "pendingWithdrawals": 0
      },
      "loyalty": {
        "currentTier": "GOLD",
        "totalXP": 5000
      },
      "gameStats": {
        "totalGames": 150,
        "borletteTickets": 50,
        "megaMillionTickets": 30,
        "rouletteTickets": 40,
        "dominoGames": 30
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5,
    "hasMore": true
  }
}
```

**Example:**

```bash
curl -X GET "https://your-api-domain.com/api/admin/users?page=1&limit=20&status=active&loyaltyTier=GOLD" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## User CRUD Operations

### 2. Create User

Create a new user account (admin only).

**Endpoint:** `POST /api/admin/users`

**Authentication:** Required (ADMIN role)

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "1234567890",
  "countryCode": "+1",
  "countryName": "United States",
  "countryISO": "US",
  "dob": "1990-01-01",
  "password": "password123",
  "role": "USER",
  "address1": "123 Main Street",
  "address2": "Apt 4B",
  "city": "New York",
  "state": "NY",
  "country": "United States",
  "pincode": "10001",
  "sim_nif": "NIF123456",
  "isActive": true,
  "loyaltyTier": "BRONZE"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `firstName` | String | Yes | User's first name |
| `lastName` | String | Yes | User's last name |
| `email` | String | Yes | User's email address (must be unique) |
| `phone` | String | Yes | User's phone number (must be unique) |
| `countryCode` | String | Yes | Country dial code (e.g., "+1", "+91") |
| `countryName` | String | No | Full country name (e.g., "United States") |
| `countryISO` | String | No | 2-digit ISO 3166-1 ALPHA-2 code (e.g., "US", "IN") |
| `dob` | String | Yes | Date of birth |
| `password` | String | Yes | Password (minimum 6 characters) |
| `role` | String | No | User role (default: "USER") |
| `address1` | String | No | Primary address line |
| `address2` | String | No | Secondary address line |
| `city` | String | No | City |
| `state` | String | No | 2-digit uppercase state code (e.g., "NY", "CA", "TX") |
| `country` | String | No | Country |
| `pincode` | String | No | Postal/ZIP code |
| `sim_nif` | String | No | SIM/NIF number |
| `isActive` | Boolean | No | Account active status (default: true) |
| `loyaltyTier` | String | No | Initial loyalty tier: `NONE`, `BRONZE`, `SILVER`, `GOLD`, `VIP` (default: "NONE") |

**Success Response (201):**

```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john.doe@example.com",
    "phone": "1234567890",
    "countryCode": "+1",
    "countryName": "United States",
    "countryISO": "US",
    "role": "USER",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request - Missing required fields:**
```json
{
  "success": false,
  "error": "Missing required fields"
}
```

**409 Conflict - User already exists:**
```json
{
  "success": false,
  "error": "User with this email or phone already exists"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "1234567890",
    "countryCode": "+1",
    "countryName": "United States",
    "countryISO": "US",
    "dob": "1990-01-01",
    "password": "password123"
  }'
```

**Notes:**
- Automatically creates a wallet for the user
- Initializes loyalty profile for the user
- If `loyaltyTier` is specified and not "NONE", the user's tier is set accordingly

---

### 3. Update User

Update user information (partial updates supported).

**Endpoint:** `PUT /api/admin/users/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

All fields are optional. Only include fields you want to update.

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "phone": "9876543210",
  "countryCode": "+1",
  "countryName": "United States",
  "countryISO": "US",
  "dob": "1992-05-15",
  "role": "USER",
  "isActive": true,
  "address1": "456 Oak Avenue",
  "city": "Los Angeles",
  "state": "CA",
  "country": "United States",
  "pincode": "90001",
  "sim_nif": "NIF789012",
  "bankAccounts": [
    {
      "bank": "Chase Bank",
      "accountNumber": "1234567890",
      "ifsc": "CHASUS33"
    }
  ]
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `firstName` | String | No | User's first name |
| `lastName` | String | No | User's last name |
| `email` | String | No | User's email address |
| `phone` | String | No | User's phone number |
| `countryCode` | String | No | Country dial code |
| `countryName` | String | No | Full country name (e.g., "United States", "India") |
| `countryISO` | String | No | 2-digit ISO 3166-1 ALPHA-2 country code (e.g., "US", "IN") |
| `dob` | String | No | Date of birth |
| `role` | String | No | User role |
| `isActive` | Boolean | No | Account active status |
| `address1` | String | No | Primary address line |
| `address2` | String | No | Secondary address line |
| `city` | String | No | City |
| `state` | String | No | 2-digit uppercase state code (e.g., "NY", "CA", "TX") |
| `country` | String | No | Country |
| `pincode` | String | No | Postal/ZIP code |
| `sim_nif` | String | No | SIM/NIF number |
| `bankAccounts` | Array | No | Bank accounts array (replaces entire array) |

**Success Response (200):**

```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "Jane",
      "lastName": "Doe"
    },
    "email": "jane.doe@example.com",
    "phone": "9876543210",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X PUT https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstName": "Jane",
    "email": "jane.doe@example.com"
  }'
```

---

### 4. Get User Details

Get detailed user information including wallet, loyalty, gaming activity, and financial analytics.

**Endpoint:** `GET /api/admin/users/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | String | No | Filter analytics by start date (ISO 8601) |
| `endDate` | String | No | Filter analytics by end date (ISO 8601) |

**Success Response (200):**

```json
{
  "success": true,
  "userDetails": {
    "profile": {
      "_id": "507f1f77bcf86cd799439011",
      "name": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "email": "john.doe@example.com",
      "phone": "1234567890",
      "countryCode": "+1",
      "countryName": "United States",
      "countryISO": "US",
      "role": "USER",
      "isActive": true,
      "address": {
        "address1": "123 Main Street",
        "city": "New York",
        "state": "NY",
        "country": "United States"
      },
      "idProof": {
        "verificationStatus": "VERIFIED"
      },
      "addressProof": {
        "verificationStatus": "PENDING"
      }
    },
    "wallet": {
      "virtualBalance": 1000.50,
      "realBalanceWithdrawable": 500.25,
      "realBalanceNonWithdrawable": 100.00,
      "totalRealBalance": 600.25,
      "pendingWithdrawals": 0,
      "active": true
    },
    "loyalty": {
      "currentTier": "GOLD",
      "totalXP": 5000
    },
    "financialSummary": {
      "totalDeposits": 5000.00,
      "totalWithdrawals": 1000.00,
      "currentBalance": 1600.75
    },
    "gamingActivity": {
      "totalGames": 150,
      "borletteTickets": 50,
      "megaMillionTickets": 30,
      "rouletteTickets": 40,
      "dominoGames": 30
    },
    "cashTypeAnalytics": {
      "REAL": {
        "totalAmountSpent": 2000.00,
        "totalWon": 1800.00,
        "totalLoss": 200.00,
        "totalGames": 75,
        "winningGames": 30,
        "wonRate": 40.0,
        "netProfit": -200.00,
        "profitMargin": -10.0
      },
      "VIRTUAL": {
        "totalAmountSpent": 1000.00,
        "totalWon": 1200.00,
        "totalLoss": -200.00,
        "totalGames": 75,
        "winningGames": 35,
        "wonRate": 46.67,
        "netProfit": 200.00,
        "profitMargin": 20.0
      }
    },
    "detailedCashTypeAnalytics": {
      "borlette": [...],
      "megaMillion": [...],
      "roulette": [...],
      "domino": [...]
    },
    "recentTransactions": [...],
    "recentPayments": [...],
    "recentWithdrawals": [...],
    "appliedFilters": {
      "startDate": null,
      "endDate": null,
      "dateFilterApplied": false
    }
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X GET "https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Document Verification

### 5. Verify User Document

Verify a user's ID proof or address proof document.

**Endpoint:** `POST /api/admin/users/:id/verify-document`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

```json
{
  "documentType": "idProof"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentType` | String | Yes | Document type: `idProof` or `addressProof` |

**Success Response (200):**

```json
{
  "success": true,
  "message": "idProof verified successfully"
}
```

**Error Responses:**

**400 Bad Request - Invalid document type:**
```json
{
  "success": false,
  "error": "Invalid document type"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/verify-document \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "documentType": "idProof"
  }'
```

**Notes:**
- Awards 50 XP to the user upon verification
- Sets verification status to "VERIFIED"
- Clears any previous rejection reason

---

### 6. Reject User Document

Reject a user's document with a reason.

**Endpoint:** `POST /api/admin/users/:id/reject-document`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

```json
{
  "documentType": "addressProof",
  "rejectionReason": "Document is unclear or incomplete. Please upload a clearer image."
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentType` | String | Yes | Document type: `idProof` or `addressProof` |
| `rejectionReason` | String | Yes | Reason for rejection |

**Success Response (200):**

```json
{
  "success": true,
  "message": "addressProof rejected"
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Rejection reason is required"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/reject-document \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "documentType": "addressProof",
    "rejectionReason": "Document is unclear or incomplete."
  }'
```

---

## Loyalty & Rewards Management

### 7. Update User Loyalty

Update user's loyalty tier and/or adjust XP points.

**Endpoint:** `PUT /api/admin/users/:id/loyalty`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

```json
{
  "tier": "GOLD",
  "xpAdjustment": 500,
  "reason": "Promotional bonus"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tier` | String | No | Loyalty tier: `BRONZE`, `SILVER`, `GOLD`, `VIP` |
| `xpAdjustment` | Number | No | XP adjustment (can be positive or negative) |
| `reason` | String | No | Reason for the adjustment |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Loyalty updated successfully",
  "result": {
    "success": true,
    "tierUpdate": {
      "success": true
    },
    "xpUpdate": {
      "success": true
    }
  }
}
```

**Error Responses:**

**400 Bad Request - Invalid tier:**
```json
{
  "success": false,
  "error": "Invalid loyalty tier"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X PUT https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/loyalty \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "tier": "GOLD",
    "xpAdjustment": 500,
    "reason": "Promotional bonus"
  }'
```

**Notes:**
- Both `tier` and `xpAdjustment` are optional
- You can update tier only, XP only, or both
- XP adjustment can be negative to deduct points

---

## Account Management

### 8. Reset User Password

Reset a user's password (admin sets new password).

**Endpoint:** `POST /api/admin/users/:id/reset-password`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

```json
{
  "newPassword": "newpassword123"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `newPassword` | String | Yes | New password (minimum 6 characters) |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Password must be at least 6 characters long"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/reset-password \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "newPassword": "newpassword123"
  }'
```

---

### 9. Reset User PIN

Reset a user's secure PIN (sets it to null, user must set a new PIN).

**Endpoint:** `POST /api/admin/users/:id/reset-pin`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:** None

**Success Response (200):**

```json
{
  "success": true,
  "message": "PIN reset successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/reset-pin \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- After reset, the user will need to set a new PIN
- PIN is set to `null` after reset

---

### 10. Update User Status

Update user account status (active, suspended, or banned).

**Endpoint:** `PUT /api/admin/users/:id/status`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): User ID

**Request Body:**

```json
{
  "status": "suspended",
  "reason": "Violation of terms of service"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | String | Yes | Account status: `active`, `suspended`, `banned` |
| `reason` | String | No | Reason for status change |

**Success Response (200):**

```json
{
  "success": true,
  "message": "User status updated to suspended",
  "newStatus": {
    "status": "suspended",
    "isActive": false,
    "reason": "Violation of terms of service"
  }
}
```

**Error Responses:**

**400 Bad Request - Invalid status:**
```json
{
  "success": false,
  "error": "Invalid status"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**

```bash
curl -X PUT https://your-api-domain.com/api/admin/users/507f1f77bcf86cd799439011/status \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "suspended",
    "reason": "Violation of terms of service"
  }'
```

---

## Bulk Operations

### 11. Bulk Update Users

Perform bulk operations on multiple users (suspend, activate, verify documents, update tiers).

**Endpoint:** `POST /api/admin/users/bulk-update`

**Authentication:** Required (ADMIN role)

**Request Body:**

```json
{
  "userIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "action": "suspend",
  "data": {
    "reason": "Bulk suspension for review"
  }
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userIds` | Array | Yes | Array of user IDs |
| `action` | String | Yes | Action to perform: `suspend`, `activate`, `verify`, `updateTier` |
| `data` | Object | No | Additional data for the action |

**Action-Specific Data:**

- **suspend/activate**: `{ "reason": "string" }`
- **verify**: `{ "documentType": "idProof" | "addressProof" }`
- **updateTier**: `{ "tier": "BRONZE" | "SILVER" | "GOLD" | "VIP", "reason": "string" }`

**Success Response (200):**

```json
{
  "success": true,
  "message": "Bulk operation completed: 2 succeeded, 1 failed",
  "results": [
    {
      "userId": "507f1f77bcf86cd799439011",
      "success": true,
      "message": "User status updated to suspended"
    },
    {
      "userId": "507f1f77bcf86cd799439012",
      "success": true,
      "message": "User status updated to suspended"
    },
    {
      "userId": "507f1f77bcf86cd799439013",
      "success": false,
      "error": "User not found"
    }
  ],
  "summary": {
    "total": 3,
    "succeeded": 2,
    "failed": 1
  }
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "success": false,
  "error": "User IDs array is required"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/bulk-update \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "userIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
    "action": "activate",
    "data": {
      "reason": "Accounts reviewed and approved"
    }
  }'
```

---

## Data Export

### 12. Export Users

Export user data for analysis or reporting.

**Endpoint:** `POST /api/admin/users/export`

**Authentication:** Required (ADMIN role)

**Request Body:**

```json
{
  "format": "csv",
  "filters": {
    "isActive": true,
    "role": "USER"
  }
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | String | No | Export format: `csv` or `excel` (default: `csv`) |
| `filters` | Object | No | MongoDB filter object for filtering users |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Export data prepared",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "userName": "johndoe123",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "1234567890",
      "country": "United States",
      "isActive": true,
      "registrationDate": "2024-01-01T00:00:00.000Z",
      "lastLogin": "2024-01-15T10:00:00.000Z",
      "idProofStatus": "VERIFIED",
      "addressProofStatus": "PENDING"
    }
  ],
  "format": "csv",
  "exportedAt": "2024-01-16T12:00:00.000Z",
  "exportedBy": "507f1f77bcf86cd799439010"
}
```

**Example:**

```bash
curl -X POST https://your-api-domain.com/api/admin/users/export \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "format": "csv",
    "filters": {
      "isActive": true
    }
  }'
```

**Notes:**
- Returns data structure that can be processed by frontend
- For large exports, consider implementing a job queue system
- Filters use MongoDB query syntax

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
- Missing required fields
- Invalid state code format (must be 2-digit uppercase code like "NY", "CA")
- Invalid loyalty tier
- Invalid status value

#### 401 Unauthorized
```
401 Unauthorized
```
- Missing or invalid authentication token
- Token expired
- Insufficient permissions (not ADMIN role)

#### 404 Not Found
```json
{
  "success": false,
  "error": "User not found"
}
```

#### 409 Conflict
```json
{
  "success": false,
  "error": "User with this email or phone already exists"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Best Practices

### User Creation
- Always provide `countryName` and `countryISO` when creating users
- Set appropriate `loyaltyTier` during creation if needed
- Ensure email and phone are unique
- State code must be a 2-digit uppercase code (e.g., "NY", "CA", "TX")

### User Updates
- Use partial updates - only send fields that need to be changed
- Address fields are merged with existing address
- State code must be a 2-digit uppercase code (e.g., "NY", "CA", "TX")
- Bank accounts array completely replaces existing array

### Document Verification
- Always provide clear rejection reasons when rejecting documents
- Verification awards XP automatically
- Document verification status affects user capabilities

### Bulk Operations
- Use bulk operations for efficiency when managing multiple users
- Check the `summary` field in response to see success/failure counts
- Individual failures don't stop the entire operation

### Data Export
- Use filters to export specific user subsets
- For large datasets, consider pagination or job queues
- Export data can be processed by frontend for CSV/Excel generation

---

## Rate Limiting

- All endpoints are rate-limited per admin user
- Bulk operations may have stricter rate limits
- Export operations may be queued for large datasets

---

## Support

For API support or questions, please contact the development team or refer to the main API documentation.

---

## Changelog

### Version 1.0.0
- Initial API documentation
- User CRUD operations
- Document verification
- Loyalty management
- Account management
- Bulk operations
- Data export
