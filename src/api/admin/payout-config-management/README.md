# Payout Config Management API Documentation

This document provides comprehensive information about the Payout Configuration Management API endpoints for admin users.

## Base URL
All endpoints are prefixed with: `/api/admin/payout-config-management`

## Authentication
All endpoints require:
- **x-api-key** header
- **Authorization** header with Bearer token (JWT)
- **Role**: ADMIN

---

## Endpoints

### 1. Get Current Active Payout Configurations

Retrieve all currently active payout configurations for all tiers and game types.

**Endpoint:** `GET /api/admin/payout-config-management/current`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| None | - | - | - |

**Response (200 OK):**

```json
{
  "success": true,
  "configurations": [
    {
      "_id": "string",
      "tier": "SILVER",
      "gameType": "BORLETTE",
      "payoutPercentage": 60,
      "isActive": true,
      "createdBy": {
        "_id": "string",
        "userName": "string",
        "name": "string"
      },
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validTo": null,
      "description": "Default Silver tier payout",
      "isPromotional": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/current', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `500 Internal Server Error`: Failed to retrieve configurations

---

### 2. Create New Payout Configuration

Create a new payout configuration for a specific tier and game type. If an active configuration already exists for the tier-game combination, it will be deactivated automatically.

**Endpoint:** `POST /api/admin/payout-config-management`

**Request Body:**

```json
{
  "tier": "GOLD",
  "gameType": "BORLETTE",
  "percentage": 65,
  "description": "Gold tier borlette payout configuration",
  "isPromotional": false,
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validTo": "2024-12-31T23:59:59.000Z"
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tier` | string | Yes | Tier name: `SILVER`, `GOLD`, or `VIP` |
| `gameType` | string | Yes | Game type: `BORLETTE`, `ROULETTE`, or `DOMINOES` |
| `percentage` | number | Yes | Payout percentage (0-200) |
| `description` | string | No | Description of the configuration |
| `isPromotional` | boolean | No | Whether this is a promotional configuration (default: false) |
| `validFrom` | string/Date | No | Start date for validity (default: current date) |
| `validTo` | string/Date | No | End date for validity (null = indefinitely valid) |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Payout configuration set successfully. Previous active configuration deactivated.",
  "config": {
    "_id": "string",
    "tier": "GOLD",
    "gameType": "BORLETTE",
    "payoutPercentage": 65,
    "isActive": true,
    "createdBy": "string",
    "validFrom": "2024-01-01T00:00:00.000Z",
    "validTo": "2024-12-31T23:59:59.000Z",
    "description": "Gold tier borlette payout configuration",
    "isPromotional": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'GOLD',
    gameType: 'BORLETTE',
    percentage: 65,
    description: 'Gold tier borlette payout configuration',
    isPromotional: false,
    validFrom: '2024-01-01T00:00:00.000Z',
    validTo: '2024-12-31T23:59:59.000Z'
  })
})
```

**Error Responses:**

- `400 Bad Request`: Invalid tier, gameType, or percentage
- `400 Bad Request`: Valid to date must be after valid from date
- `500 Internal Server Error`: Failed to set payout configuration

---

### 3. Update Existing Payout Configuration

Update an existing active payout configuration. Only active configurations can be updated.

**Endpoint:** `PUT /api/admin/payout-config-management/:id`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Configuration ID |

**Request Body:**

```json
{
  "percentage": 70,
  "description": "Updated Gold tier payout",
  "isPromotional": true,
  "validTo": "2025-12-31T23:59:59.000Z"
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `percentage` | number | No | Updated payout percentage (0-200) |
| `description` | string | No | Updated description |
| `isPromotional` | boolean | No | Updated promotional flag |
| `validTo` | string/Date | No | Updated end date for validity |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Payout configuration updated successfully",
  "config": {
    "_id": "string",
    "tier": "GOLD",
    "gameType": "BORLETTE",
    "payoutPercentage": 70,
    "isActive": true,
    "createdBy": "string",
    "validFrom": "2024-01-01T00:00:00.000Z",
    "validTo": "2025-12-31T23:59:59.000Z",
    "description": "Updated Gold tier payout",
    "isPromotional": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    percentage: 70,
    description: 'Updated Gold tier payout',
    isPromotional: true
  })
})
```

**Error Responses:**

- `400 Bad Request`: Invalid percentage value
- `400 Bad Request`: Cannot update inactive configuration
- `400 Bad Request`: Valid to date must be after valid from date
- `404 Not Found`: Payout configuration not found
- `500 Internal Server Error`: Failed to update payout configuration

---

### 4. Deactivate Payout Configuration

Deactivate an existing payout configuration. This will make the configuration inactive and revert to default percentages if no other active configuration exists.

**Endpoint:** `DELETE /api/admin/payout-config-management/:id`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Configuration ID |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Payout configuration deactivated successfully"
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/507f1f77bcf86cd799439011', {
  method: 'DELETE',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `404 Not Found`: Configuration not found
- `500 Internal Server Error`: Failed to deactivate configuration

---

### 5. Get Configuration History

Retrieve paginated history of all payout configurations (both active and inactive) with optional filtering.

**Endpoint:** `GET /api/admin/payout-config-management/history`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 50 | Number of configurations per page |
| `offset` | number | No | 0 | Number of configurations to skip |
| `tier` | string | No | - | Filter by tier: `SILVER`, `GOLD`, or `VIP` |
| `gameType` | string | No | - | Filter by game type: `BORLETTE`, `ROULETTE`, or `DOMINOES` |

**Response (200 OK):**

```json
{
  "success": true,
  "configurations": [
    {
      "_id": "string",
      "tier": "GOLD",
      "gameType": "BORLETTE",
      "payoutPercentage": 65,
      "isActive": false,
      "createdBy": {
        "_id": "string",
        "userName": "string",
        "name": "string"
      },
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validTo": null,
      "description": "Previous Gold tier configuration",
      "isPromotional": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T00:00:00.000Z"
    }
  ],
  "total": 150
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/history?limit=20&offset=0&tier=GOLD&gameType=BORLETTE', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `500 Internal Server Error`: Failed to retrieve configuration history

---

### 6. Get Payout Analytics

Retrieve analytics and statistics about payout configurations.

**Endpoint:** `GET /api/admin/payout-config-management/analytics`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string/Date | No | Start date for filtering (ISO 8601 format) |
| `endDate` | string/Date | No | End date for filtering (ISO 8601 format) |

**Response (200 OK):**

```json
{
  "success": true,
  "analytics": {
    "configurationStats": [
      {
        "_id": {
          "tier": "GOLD",
          "gameType": "BORLETTE",
          "isPromotional": false
        },
        "count": 5,
        "avgPercentage": 65.0,
        "maxPercentage": 70,
        "minPercentage": 60
      }
    ],
    "activeConfigurations": 9,
    "promotionalConfigurations": 2
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/analytics?startDate=2024-01-01&endDate=2024-12-31', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `500 Internal Server Error`: Failed to retrieve payout analytics

---

### 7. Validate Tier-Based Payout System

Validate the integrity of the tier-based payout system. This endpoint performs comprehensive checks on configurations, tickets, and system integrity.

**Endpoint:** `GET /api/admin/payout-config-management/validate-system`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| None | - | - | - |

**Response (200 OK):**

```json
{
  "success": true,
  "validationResults": {
    "configurationValidation": {
      "totalActiveConfigs": 9,
      "missingConfigurations": [],
      "promotionalConfigs": 2,
      "configurationsByTier": {
        "SILVER": 3,
        "GOLD": 3,
        "VIP": 3
      }
    },
    "ticketValidation": {
      "ticketsByTier": [
        {
          "_id": "GOLD",
          "count": 1500,
          "hasPayoutConfig": 1500,
          "avgPayoutPercentage": 65.0
        }
      ],
      "ticketsWithoutTier": 0,
      "ticketsWithoutPayoutConfig": 0,
      "totalTickets": 5000
    },
    "systemIntegrity": {
      "payoutInconsistencies": 0,
      "duplicateActiveConfigs": 0,
      "duplicateDetails": []
    },
    "recommendations": []
  },
  "systemHealth": "HEALTHY",
  "validatedAt": "2024-01-15T00:00:00.000Z",
  "summary": {
    "totalIssues": 0,
    "criticalIssues": 0,
    "warningIssues": 0
  }
}
```

**System Health Values:**

- `HEALTHY`: No issues found
- `WARNING`: Medium severity issues found
- `CRITICAL`: High severity issues found

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/validate-system', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `500 Internal Server Error`: Failed to validate tier payout system

---

### 8. Test Tier-Based Payout Calculation

Test payout calculations for a specific tier and game type with custom scenarios.

**Endpoint:** `POST /api/admin/payout-config-management/test-calculation`

**Request Body:**

```json
{
  "tier": "GOLD",
  "gameType": "BORLETTE",
  "baseAmount": 100,
  "numbers": [
    {
      "numberPlayed": "12",
      "amountPlayed": 10,
      "multiplier": 65
    },
    {
      "numberPlayed": "34",
      "amountPlayed": 10,
      "multiplier": 20
    }
  ]
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tier` | string | Yes | Tier name: `SILVER`, `GOLD`, or `VIP` |
| `gameType` | string | No | Game type (default: `BORLETTE`) |
| `baseAmount` | number | Yes | Base amount for testing |
| `numbers` | array | No | Custom test scenarios (uses defaults if not provided) |

**Number Object Structure:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `numberPlayed` | string | Yes | Number played |
| `amountPlayed` | number | Yes | Amount played |
| `multiplier` | number | Yes | Base multiplier |

**Response (200 OK):**

```json
{
  "success": true,
  "testResults": {
    "tierInfo": {
      "tier": "GOLD",
      "gameType": "BORLETTE",
      "payoutPercentage": 65,
      "isCustomConfig": true,
      "description": "Gold tier borlette payout"
    },
    "calculations": [
      {
        "scenario": {
          "numberPlayed": "12",
          "amountPlayed": 10,
          "multiplier": 65
        },
        "basePayout": 650,
        "adjustedPayout": 704.17,
        "difference": 54.17,
        "tierMultiplier": 1.0833,
        "payoutConfig": {
          "percentage": 65,
          "isCustom": true
        }
      }
    ],
    "summary": {
      "totalBasePayout": 650,
      "totalAdjustedPayout": 704.17,
      "totalDifference": 54.17,
      "tierMultiplier": 1.0833
    }
  },
  "testedAt": "2024-01-15T00:00:00.000Z"
}
```

**Example Request:**

```javascript
fetch('/api/admin/payout-config-management/test-calculation', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'GOLD',
    gameType: 'BORLETTE',
    baseAmount: 100,
    numbers: [
      {
        numberPlayed: '12',
        amountPlayed: 10,
        multiplier: 65
      }
    ]
  })
})
```

**Error Responses:**

- `400 Bad Request`: Valid tier is required
- `400 Bad Request`: Valid base amount is required
- `500 Internal Server Error`: Failed to test payout calculation

---

## Data Models

### PayoutConfig Model

```typescript
{
  _id: string;
  tier: 'SILVER' | 'GOLD' | 'VIP';
  gameType: 'BORLETTE' | 'ROULETTE' | 'DOMINOES';
  payoutPercentage: number; // 0-200
  isActive: boolean;
  createdBy: string; // User ID reference
  validFrom: Date;
  validTo: Date | null; // null = indefinitely valid
  description: string;
  isPromotional: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Default Payout Percentages

If no active configuration exists, the system falls back to these default percentages:

- **BORLETTE**:
  - SILVER: 60%
  - GOLD: 65%
  - VIP: 70%

---

## Notes

1. **Only one active configuration per tier-game combination**: When creating a new configuration, any existing active configuration for the same tier-game combination will be automatically deactivated.

2. **Date validation**: The `validTo` date must be after the `validFrom` date. If `validTo` is null, the configuration is valid indefinitely.

3. **Percentage range**: Payout percentages can range from 0 to 200 (allowing for promotional bonuses up to 200%).

4. **Inactive configurations**: Only active configurations can be updated. To modify an inactive configuration, you must reactivate it first or create a new one.

5. **Promotional configurations**: Mark configurations as promotional to track special offers or bonuses separately.

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400 Bad Request`: Invalid input parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error

