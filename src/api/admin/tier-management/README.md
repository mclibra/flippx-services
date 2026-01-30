# Tier Management API (Admin)

REST API endpoints for administrators to manage tier requirements configuration. Admins can create, view, update, activate, and deactivate tier configurations that define user tier benefits, upgrade requirements, referral commissions, and downgrade settings.

---

## Quick Reference

| Area | What's Covered |
| --- | --- |
| [Admin Endpoints](#admin-endpoints) | All admin-only operations |
| [Tier Configuration](#tier-configuration) | Complete tier setup and management |
| [Data Models](#data-models) | Tier requirements schema structure |
| [Usage Examples](#usage-examples) | End-to-end workflow examples |
| [Error Handling](#error-handling) | Common errors and status codes |

---

## Admin Endpoints

All admin endpoints require:
- **Authentication**: Bearer token in Authorization header
- **Role**: ADMIN role required
- **Headers**: `x-api-key` header required

---

### 1. Get All Tier Requirements

Retrieve all tier requirements configurations. Useful for admin dashboard and tier management.

**Endpoint:** `GET /api/admin/tiers/requirements`

**Authentication:** Required (ADMIN role)

**Query Parameters:**
- `includeInactive` (Boolean, optional, default: false): Include deactivated tiers in results

**Success Response (200):**
```json
{
  "success": true,
  "tierRequirements": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "SILVER",
      "isActive": true,
      "benefits": {
        "weeklyWithdrawalLimit": 2300,
        "withdrawalTime": 48,
        "weeklyCashbackPercentage": 0,
        "monthlyCashbackPercentage": 0,
        "referralXP": 0,
        "noWinCashbackPercentage": 0,
        "noWinCashbackDays": 0
      },
      "requirements": {
        "depositAmount30Days": 150,
        "daysPlayedPerWeek": 3,
        "daysRequired": 30,
        "requireIDVerification": true,
        "previousTier": null,
        "previousTierDays": 0,
        "depositAmount60Days": 0,
        "depositAmount90Days": 0,
        "weeklySpendAmount": 0,
        "dailySessionMinutes": 0,
        "dailyLoginRequired": false
      },
      "referralCommissions": {
        "borlette": {
          "perPlay": 0,
          "monthlyCap": 0
        },
        "roulette": {
          "per100Spins": 0,
          "monthlyCap": 0
        },
        "dominoes": {
          "per100Wagered": 0,
          "monthlyCap": 0
        }
      },
      "downgrades": {
        "inactivityDaysMin": 30,
        "inactivityDaysMax": 60
      },
      "createdBy": {
        "_id": "507f191e810c19729de860ea",
        "name": {
          "first": "Admin",
          "last": "User"
        },
        "userName": "admin"
      },
      "updatedBy": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to fetch tier requirements"
}
```

**Example:**
```bash
# Get all active tier requirements
curl -X GET "https://your-api-domain.com/api/admin/tiers/requirements" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Get all tier requirements including inactive
curl -X GET "https://your-api-domain.com/api/admin/tiers/requirements?includeInactive=true" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- Results are sorted by creation date (newest first)
- CreatedBy and updatedBy fields are populated with admin user details
- By default, only active tiers are returned
- Use `includeInactive=true` to see deactivated tiers

---

### 2. Get Tier Requirement by ID

Retrieve a specific tier requirements configuration by its MongoDB ObjectId.

**Endpoint:** `GET /api/admin/tiers/requirements/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): MongoDB ObjectId of the tier requirement

**Success Response (200):**
```json
{
  "success": true,
  "tierRequirement": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "GOLD",
    "isActive": true,
    "benefits": {
      "weeklyWithdrawalLimit": 3350,
      "withdrawalTime": 24,
      "weeklyCashbackPercentage": 0,
      "monthlyCashbackPercentage": 0,
      "referralXP": 8,
      "noWinCashbackPercentage": 1,
      "noWinCashbackDays": 15
    },
    "requirements": {
      "previousTier": "SILVER",
      "previousTierDays": 60,
      "depositAmount60Days": 1000,
      "daysPlayedPerWeek": 4,
      "daysRequired": 60,
      "weeklySpendAmount": 150,
      "dailySessionMinutes": 5,
      "depositAmount30Days": 0,
      "depositAmount90Days": 0,
      "requireIDVerification": false,
      "dailyLoginRequired": false
    },
    "referralCommissions": {
      "borlette": {
        "perPlay": 0.02,
        "monthlyCap": 5500
      },
      "roulette": {
        "per100Spins": 0.075,
        "monthlyCap": 4000
      },
      "dominoes": {
        "per100Wagered": 0.05,
        "monthlyCap": 4000
      }
    },
    "downgrades": {
      "inactivityDaysMin": 30,
      "inactivityDaysMax": 60
    },
    "createdBy": {
      "_id": "507f191e810c19729de860ea",
      "name": {
        "first": "Admin",
        "last": "User"
      },
      "userName": "admin"
    },
    "updatedBy": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid tier ID format"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Tier requirement configuration not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to fetch tier requirement"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- The ID must be a valid MongoDB ObjectId
- Returns full tier configuration with populated user references
- Useful for viewing specific tier details before editing

---

### 3. Create Tier Requirement

Create a new tier requirements configuration. This endpoint allows admins to define all aspects of a tier including benefits, upgrade requirements, referral commissions, and downgrade settings.

**Endpoint:** `POST /api/admin/tiers/requirements`

**Authentication:** Required (ADMIN role)

**Request Body:**
```json
{
  "name": "PLATINUM",
  "benefits": {
    "weeklyWithdrawalLimit": 7500,
    "withdrawalTime": 12,
    "weeklyCashbackPercentage": 2,
    "monthlyCashbackPercentage": 5,
    "referralXP": 15,
    "noWinCashbackPercentage": 5,
    "noWinCashbackDays": 20
  },
  "requirements": {
    "previousTier": "VIP",
    "previousTierDays": 120,
    "depositAmount90Days": 5000,
    "daysPlayedPerWeek": 6,
    "daysRequired": 120,
    "weeklySpendAmount": 500,
    "dailySessionMinutes": 10,
    "requireIDVerification": true,
    "dailyLoginRequired": true
  },
  "referralCommissions": {
    "borlette": {
      "perPlay": 0.05,
      "monthlyCap": 15000
    },
    "roulette": {
      "per100Spins": 0.2,
      "monthlyCap": 12000
    },
    "dominoes": {
      "per100Wagered": 0.15,
      "monthlyCap": 12000
    }
  },
  "downgrades": {
    "inactivityDaysMin": 45,
    "inactivityDaysMax": 90
  }
}
```

**Request Parameters:**
- `name` (String, required): Tier name (e.g., "SILVER", "GOLD", "VIP", "PLATINUM")
- `benefits` (Object, optional): Tier benefits configuration
  - `weeklyWithdrawalLimit` (Number, default: 0): Maximum withdrawal amount per week
  - `withdrawalTime` (Number, default: 72): Withdrawal processing time in hours
  - `weeklyCashbackPercentage` (Number, default: 0): Weekly cashback percentage
  - `monthlyCashbackPercentage` (Number, default: 0): Monthly cashback percentage
  - `referralXP` (Number, default: 0): XP earned per referral
  - `noWinCashbackPercentage` (Number, default: 0): Cashback percentage for no-win scenarios
  - `noWinCashbackDays` (Number, default: 0): Days to calculate no-win cashback
- `requirements` (Object, optional): Upgrade requirements
  - `previousTier` (String, optional): Required previous tier name
  - `previousTierDays` (Number, default: 0): Days required in previous tier
  - `depositAmount30Days` (Number, default: 0): Deposit amount required in last 30 days
  - `depositAmount60Days` (Number, default: 0): Deposit amount required in last 60 days
  - `depositAmount90Days` (Number, default: 0): Deposit amount required in last 90 days
  - `daysPlayedPerWeek` (Number, default: 0): Minimum days played per week
  - `weeklySpendAmount` (Number, default: 0): Minimum weekly spend amount
  - `dailySessionMinutes` (Number, default: 0): Minimum daily session minutes
  - `daysRequired` (Number, default: 0): Total days required to qualify
  - `requireIDVerification` (Boolean, default: false): Whether ID verification is required
  - `dailyLoginRequired` (Boolean, default: false): Whether daily login is required
- `referralCommissions` (Object, optional): Referral commission rates
  - `borlette` (Object): Borlette game commissions
    - `perPlay` (Number, default: 0): Commission per play
    - `monthlyCap` (Number, default: 0): Monthly commission cap
  - `roulette` (Object): Roulette game commissions
    - `per100Spins` (Number, default: 0): Commission per 100 spins
    - `monthlyCap` (Number, default: 0): Monthly commission cap
  - `dominoes` (Object): Dominoes game commissions
    - `per100Wagered` (Number, default: 0): Commission per 100 wagered
    - `monthlyCap` (Number, default: 0): Monthly commission cap
- `downgrades` (Object, optional): Downgrade settings
  - `inactivityDaysMin` (Number, default: 30): Minimum inactivity days before downgrade consideration
  - `inactivityDaysMax` (Number, default: 60): Maximum inactivity days before downgrade

**Success Response (201):**
```json
{
  "success": true,
  "message": "Tier requirement created successfully",
  "tierRequirement": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "PLATINUM",
    "isActive": true,
    "benefits": { /* ... */ },
    "requirements": { /* ... */ },
    "referralCommissions": { /* ... */ },
    "downgrades": { /* ... */ },
    "createdBy": "507f191e810c19729de860ea",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Tier and name are required"
}
```

**Error Response (409):**
```json
{
  "success": false,
  "error": "Tier requirement configuration already exists"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to create tier requirement"
}
```

**Example:**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "PLATINUM",
    "benefits": {
      "weeklyWithdrawalLimit": 7500,
      "withdrawalTime": 12
    },
    "requirements": {
      "previousTier": "VIP",
      "previousTierDays": 120
    }
  }'
```

**Notes:**
- Tier name is automatically converted to uppercase
- Tier names must be unique (case-insensitive)
- All nested objects have default values if not provided
- CreatedBy is automatically set to the authenticated admin user

---

### 4. Update Tier Requirement

Update an existing tier requirements configuration by ID. Only provided fields will be updated (partial update supported).

**Endpoint:** `PUT /api/admin/tiers/requirements/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): MongoDB ObjectId of the tier requirement

**Request Body:**
```json
{
  "benefits": {
    "weeklyWithdrawalLimit": 8000,
    "withdrawalTime": 6
  },
  "requirements": {
    "depositAmount90Days": 6000,
    "weeklySpendAmount": 600
  }
}
```

**Request Parameters:**
- All parameters are optional - only include fields you want to update
- Same structure as POST endpoint (see [Create Tier Requirement](#3-create-tier-requirement))

**Success Response (200):**
```json
{
  "success": true,
  "message": "Tier requirement updated successfully",
  "tierRequirement": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "GOLD",
    "isActive": true,
    "benefits": {
      "weeklyWithdrawalLimit": 8000,
      "withdrawalTime": 6,
      /* ... other benefits ... */
    },
    "requirements": {
      "depositAmount90Days": 6000,
      "weeklySpendAmount": 600,
      /* ... other requirements ... */
    },
    /* ... other fields ... */
    "updatedBy": "507f191e810c19729de860ea",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid tier ID format"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Tier requirement configuration not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to update tier requirement"
}
```

**Example:**
```bash
curl -X PUT "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "benefits": {
      "weeklyWithdrawalLimit": 8000,
      "withdrawalTime": 6
    }
  }'
```

**Notes:**
- Partial updates are supported - only include fields you want to change
- Nested objects are merged (not replaced) - existing values are preserved
- UpdatedBy is automatically set to the authenticated admin user
- The ID must be a valid MongoDB ObjectId

---

### 5. Deactivate Tier Requirement

Deactivate a tier requirements configuration (soft delete). The tier will no longer be available for new user upgrades but existing users with this tier will retain it.

**Endpoint:** `DELETE /api/admin/tiers/requirements/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): MongoDB ObjectId of the tier requirement

**Success Response (200):**
```json
{
  "success": true,
  "message": "Tier requirement deactivated successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid tier ID format"
}
```

```json
{
  "success": false,
  "error": "Cannot deactivate NONE tier"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Tier requirement configuration not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to deactivate tier requirement"
}
```

**Example:**
```bash
curl -X DELETE "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- This is a soft delete - the tier is marked as inactive, not permanently deleted
- The NONE tier cannot be deactivated (system requirement)
- Only active tiers can be deactivated
- Existing users with this tier will retain it
- UpdatedBy is automatically set to the authenticated admin user

---

### 6. Reactivate Tier Requirement

Reactivate a previously deactivated tier requirements configuration. The tier will become available for user upgrades again.

**Endpoint:** `POST /api/admin/tiers/requirements/:id/reactivate`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): MongoDB ObjectId of the tier requirement

**Success Response (200):**
```json
{
  "success": true,
  "message": "Tier requirement reactivated successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid tier ID format"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Tier requirement configuration not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to reactivate tier requirement"
}
```

**Example:**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011/reactivate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- Only inactive tiers can be reactivated
- The tier will become available for new user upgrades after reactivation
- UpdatedBy is automatically set to the authenticated admin user

---

### 7. Initialize Default Tier Requirements

Initialize default tier requirements configuration (one-time setup). This creates all default tier configurations (NONE, SILVER, GOLD, VIP) if none exist.

**Endpoint:** `POST /api/admin/tiers/requirements/initialize`

**Authentication:** Required (ADMIN role)

**Success Response (201):**
```json
{
  "success": true,
  "message": "Default tier requirements initialized successfully",
  "tiersCreated": 4
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Tier requirements already exist. Use update endpoints to modify."
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to initialize default tier requirements"
}
```

**Example:**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements/initialize" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Notes:**
- This is a one-time setup endpoint
- Only works if no tier requirements exist
- Creates default tiers: NONE, SILVER, GOLD, VIP
- Use update endpoints to modify existing tiers
- CreatedBy is automatically set to the authenticated admin user

---

## Tier Configuration

### Default Tiers

The system includes four default tiers:

1. **NONE** - Default tier for new users
   - No withdrawal limits
   - No special benefits
   - No upgrade requirements

2. **SILVER** - First upgrade tier
   - Weekly withdrawal limit: $2,300
   - Withdrawal time: 48 hours
   - Requires: $150 deposit in 30 days, 3 days played per week, 30 days total, ID verification

3. **GOLD** - Second upgrade tier
   - Weekly withdrawal limit: $3,350
   - Withdrawal time: 24 hours
   - Referral XP: 8
   - No-win cashback: 1% for 15 days
   - Requires: Previous tier SILVER for 60 days, $1,000 deposit in 60 days, 4 days played per week, 60 days total, $150 weekly spend, 5 minutes daily session
   - Referral commissions: Borlette ($0.02 per play, $5,500 cap), Roulette ($0.075 per 100 spins, $4,000 cap), Dominoes ($0.05 per 100 wagered, $4,000 cap)

4. **VIP** - Highest tier
   - Weekly withdrawal limit: $5,500
   - Withdrawal time: 0 hours (instant)
   - Referral XP: 12
   - No-win cashback: 3% for 15 days
   - Requires: Previous tier GOLD for 90 days, $2,000 deposit in 90 days, 5 days played per week, 90 days total, $200 weekly spend, daily login required, 5 minutes daily session
   - Referral commissions: Borlette ($0.04 per play, $10,000 cap), Roulette ($0.15 per 100 spins, $8,000 cap), Dominoes ($0.10 per 100 wagered, $8,000 cap)

---

## Data Models

### Tier Requirements Model

```typescript
{
  _id: ObjectId,
  name: String, // Required, unique - Tier name (e.g., "SILVER", "GOLD", "VIP")
  isActive: Boolean, // Default: true - Whether tier is active
  benefits: {
    weeklyWithdrawalLimit: Number, // Required, default: 0 - Max withdrawal per week
    withdrawalTime: Number, // Required, default: 72 - Processing time in hours
    weeklyCashbackPercentage: Number, // Default: 0
    monthlyCashbackPercentage: Number, // Default: 0
    referralXP: Number, // Default: 0 - XP per referral
    noWinCashbackPercentage: Number, // Default: 0
    noWinCashbackDays: Number // Default: 0
  },
  requirements: {
    previousTier: String, // Optional - Required previous tier name
    previousTierDays: Number, // Default: 0 - Days required in previous tier
    depositAmount30Days: Number, // Default: 0 - Deposit in last 30 days
    depositAmount60Days: Number, // Default: 0 - Deposit in last 60 days
    depositAmount90Days: Number, // Default: 0 - Deposit in last 90 days
    daysPlayedPerWeek: Number, // Default: 0 - Min days played per week
    weeklySpendAmount: Number, // Default: 0 - Min weekly spend
    dailySessionMinutes: Number, // Default: 0 - Min daily session minutes
    daysRequired: Number, // Default: 0 - Total days required
    requireIDVerification: Boolean, // Default: false
    dailyLoginRequired: Boolean // Default: false
  },
  referralCommissions: {
    borlette: {
      perPlay: Number, // Default: 0 - Commission per play
      monthlyCap: Number // Default: 0 - Monthly commission cap
    },
    roulette: {
      per100Spins: Number, // Default: 0 - Commission per 100 spins
      monthlyCap: Number // Default: 0 - Monthly commission cap
    },
    dominoes: {
      per100Wagered: Number, // Default: 0 - Commission per 100 wagered
      monthlyCap: Number // Default: 0 - Monthly commission cap
    }
  },
  downgrades: {
    inactivityDaysMin: Number, // Default: 30 - Min inactivity days
    inactivityDaysMax: Number // Default: 60 - Max inactivity days
  },
  createdBy: String (ref: 'User'), // Required - Admin who created
  updatedBy: String (ref: 'User'), // Optional - Admin who last updated
  lastModified: Date, // Auto-updated on save
  createdAt: Date, // Auto-generated timestamp
  updatedAt: Date // Auto-generated timestamp
}
```

**Indexes:**
- `{ name: 1, isActive: 1 }` - For efficient tier lookups
- `{ isActive: 1 }` - For filtering active tiers
- `{ createdAt: -1 }` - For sorting by creation date

---

## Usage Examples

### Complete Workflow: Creating and Managing a Tier

1. **Initialize Default Tiers (One-time):**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements/initialize" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

2. **View All Tiers:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/tiers/requirements" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

3. **Get Specific Tier:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

4. **Create Custom Tier:**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "PLATINUM",
    "benefits": {
      "weeklyWithdrawalLimit": 7500,
      "withdrawalTime": 12,
      "referralXP": 15
    },
    "requirements": {
      "previousTier": "VIP",
      "previousTierDays": 120,
      "depositAmount90Days": 5000
    }
  }'
```

5. **Update Tier:**
```bash
curl -X PUT "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "benefits": {
      "weeklyWithdrawalLimit": 8000
    }
  }'
```

6. **Deactivate Tier:**
```bash
curl -X DELETE "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

7. **Reactivate Tier:**
```bash
curl -X POST "https://your-api-domain.com/api/admin/tiers/requirements/507f1f77bcf86cd799439011/reactivate" \
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
- `201` - Created successfully
- `400` - Bad Request (invalid ID format, missing required fields, cannot deactivate NONE tier)
- `403` - Forbidden (not admin role)
- `404` - Not Found (tier not found)
- `409` - Conflict (tier already exists)
- `500` - Internal Server Error (database errors, unexpected errors)

**Common Error Scenarios:**

1. **Unauthorized Access:**
   ```json
   {
     "success": false,
     "error": "Unauthorized"
   }
   ```
   Occurs when non-admin user tries to access admin endpoints

2. **Invalid Tier ID:**
   ```json
   {
     "success": false,
     "error": "Invalid tier ID format"
   }
   ```
   Occurs when provided ID is not a valid MongoDB ObjectId

3. **Tier Not Found:**
   ```json
   {
     "success": false,
     "error": "Tier requirement configuration not found"
   }
   ```
   Occurs when tier with provided ID doesn't exist

4. **Tier Already Exists:**
   ```json
   {
     "success": false,
     "error": "Tier requirement configuration already exists"
   }
   ```
   Occurs when trying to create a tier with a name that already exists

5. **Cannot Deactivate NONE Tier:**
   ```json
   {
     "success": false,
     "error": "Cannot deactivate NONE tier"
   }
   ```
   The NONE tier is a system requirement and cannot be deactivated

6. **Tier Requirements Already Exist:**
   ```json
   {
     "success": false,
     "error": "Tier requirements already exist. Use update endpoints to modify."
   }
   ```
   Occurs when trying to initialize default tiers but tiers already exist

---

## Notes

- **Admin Only**: All endpoints require ADMIN role
- **Tier ID**: All operations now use MongoDB ObjectId instead of tier name for get, update, delete, and reactivate operations
- **Soft Delete**: Deactivation is a soft delete - tiers are marked inactive, not permanently deleted
- **NONE Tier Protection**: The NONE tier cannot be deactivated (system requirement)
- **Partial Updates**: Update endpoint supports partial updates - only include fields you want to change
- **Nested Object Merging**: Nested objects (benefits, requirements, etc.) are merged, not replaced
- **Audit Trail**: All actions are tracked with `createdBy`, `updatedBy`, and `lastModified` fields
- **Case Insensitive Names**: Tier names are automatically converted to uppercase and checked case-insensitively for uniqueness
- **Default Values**: All optional fields have sensible defaults if not provided
- **One-Time Initialization**: Initialize endpoint only works if no tiers exist

---

## Testing Checklist

- [ ] Get all tier requirements (admin)
- [ ] Get all tier requirements including inactive
- [ ] Get tier requirement by valid ID
- [ ] Get tier requirement by invalid ID (should fail)
- [ ] Get tier requirement by non-existent ID (should fail)
- [ ] Create new tier requirement
- [ ] Create tier requirement with duplicate name (should fail)
- [ ] Create tier requirement with missing name (should fail)
- [ ] Update tier requirement by ID
- [ ] Update tier requirement with invalid ID (should fail)
- [ ] Update tier requirement with non-existent ID (should fail)
- [ ] Partial update tier requirement (only some fields)
- [ ] Deactivate tier requirement
- [ ] Deactivate NONE tier (should fail)
- [ ] Deactivate already inactive tier (should fail)
- [ ] Reactivate tier requirement
- [ ] Reactivate already active tier (should fail)
- [ ] Initialize default tier requirements (when none exist)
- [ ] Initialize default tier requirements when tiers exist (should fail)
- [ ] Verify admin permissions are enforced
- [ ] Verify createdBy and updatedBy are set correctly
- [ ] Verify tier names are converted to uppercase
- [ ] Verify nested objects are merged correctly on update
