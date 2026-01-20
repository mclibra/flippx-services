# Lottery Management API Documentation

This document provides comprehensive information about the Lottery Management API endpoints for admin operations. All endpoints require ADMIN role authentication.

## Base URL
All endpoints are prefixed with: `/api/admin/lottery-management`

## Authentication
All endpoints require:
- **x-api-key** header
- **Authorization** header with Bearer token (JWT)
- **Role**: ADMIN

---

## Endpoints

### 1. Get Lottery Dashboard

Get comprehensive dashboard statistics including lottery counts, revenue, upcoming lotteries, and periodic statistics.

**Endpoint:** `GET /api/admin/lottery-management/dashboard`

**Response (200 OK):**

```json
{
  "success": true,
  "summary": {
    "totalLotteries": 150,
    "scheduledLotteries": 45,
    "completedLotteries": 100,
    "todayScheduled": 5,
    "totalRevenue": 500000,
    "totalPayout": 300000,
    "totalProfit": 200000,
    "profitMargin": "40.00"
  },
  "upcomingLotteries": [
    {
      "_id": "string",
      "title": "string",
      "type": "BORLETTE",
      "scheduledTime": 1234567890,
      "countdown": 3600000,
      "jackpotAmount": 0,
      "state": {
        "_id": "string",
        "name": "string",
        "code": "string"
      },
      "status": "SCHEDULED"
    }
  ],
  "recentLotteries": [
    {
      "_id": "string",
      "title": "string",
      "type": "BORLETTE",
      "drawTime": 1234567890,
      "results": {
        "numbers": [1, 2, 3]
      },
      "state": {
        "_id": "string",
        "name": "string",
        "code": "string"
      },
      "status": "COMPLETED"
    }
  ],
  "stateDistribution": [
    {
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "total": 50,
      "scheduled": 15,
      "completed": 35
    }
  ],
  "typeDistribution": [
    {
      "_id": "BORLETTE",
      "total": 100,
      "scheduled": 30,
      "completed": 70
    },
    {
      "_id": "MEGAMILLION",
      "total": 50,
      "scheduled": 15,
      "completed": 35
    }
  ],
  "periodicStats": {
    "today": {
      "borlette": {
        "totalPlayed": 10000,
        "totalWon": 6000,
        "ticketCount": 500
      },
      "megaMillion": {
        "totalPlayed": 5000,
        "totalWon": 3000,
        "ticketCount": 250
      },
      "lotteryCount": 5,
      "revenue": 15000,
      "payout": 9000,
      "profit": 6000
    },
    "thisWeek": {
      "borlette": {
        "totalPlayed": 70000,
        "totalWon": 42000,
        "ticketCount": 3500
      },
      "megaMillion": {
        "totalPlayed": 35000,
        "totalWon": 21000,
        "ticketCount": 1750
      },
      "lotteryCount": 35,
      "revenue": 105000,
      "payout": 63000,
      "profit": 42000
    },
    "thisMonth": {
      "borlette": {
        "totalPlayed": 300000,
        "totalWon": 180000,
        "ticketCount": 15000
      },
      "megaMillion": {
        "totalPlayed": 150000,
        "totalWon": 90000,
        "ticketCount": 7500
      },
      "lotteryCount": 150,
      "revenue": 450000,
      "payout": 270000,
      "profit": 180000
    }
  },
  "gameStats": {
    "borlette": {
      "totalPlayed": 500000,
      "totalWon": 300000,
      "ticketCount": 25000,
      "profit": 200000
    },
    "megaMillion": {
      "totalPlayed": 250000,
      "totalWon": 150000,
      "ticketCount": 12500,
      "profit": 100000
    }
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/dashboard', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

---

### 2. Get State Report

Get detailed report for a specific state including lottery statistics, revenue, and profit breakdown.

**Endpoint:** `GET /api/admin/lottery-management/state/:stateId/report`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stateId` | string | Yes | State ID |

**Response (200 OK):**

```json
{
  "success": true,
  "report": {
    "state": {
      "_id": "string",
      "name": "string",
      "code": "string",
      "isActive": true
    },
    "lotteryCount": 25,
    "borlette": {
      "totalAmountPlayed": 100000,
      "totalAmountWon": 60000,
      "ticketCount": 5000,
      "profit": 40000
    },
    "megaMillion": {
      "totalAmountPlayed": 50000,
      "totalAmountWon": 30000,
      "ticketCount": 2500,
      "profit": 20000
    }
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/state/507f1f77bcf86cd799439011/report', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `403 Forbidden`: Unauthorized access (non-admin user)
- `404 Not Found`: State not found

---

### 3. Get All States Summary

Get summary statistics for all active states with lottery counts, revenue, and profit.

**Endpoint:** `GET /api/admin/lottery-management/states/summary`

**Response (200 OK):**

```json
{
  "success": true,
  "summaries": [
    {
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "lotteryCount": 25,
      "totalAmountPlayed": 150000,
      "totalAmountWon": 90000,
      "ticketCount": 7500,
      "profit": 60000
    }
  ]
}
```

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/states/summary', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

**Error Responses:**

- `403 Forbidden`: Unauthorized access (non-admin user)

---

### 4. Get All Tickets for a Lottery (Admin View)

Get all tickets for a specific lottery. Admin can see all tickets regardless of user.

**Endpoint:** `GET /api/admin/lottery-management/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `offset` | number | No | 0 | Pagination offset |
| `limit` | number | No | 10 | Number of items per page |
| `startDate` | number | No | - | Filter by creation date start (Unix timestamp) |
| `endDate` | number | No | - | Filter by creation date end (Unix timestamp) |
| `sortBy` | string | No | `purchasedOn` | Sort field |
| `sortOrder` | string | No | `desc` | Sort order: `asc` or `desc` |

**Response (200 OK):**

```json
{
  "success": true,
  "total": 100,
  "ticketList": [
    {
      "_id": "string",
      "lottery": "string",
      "user": {
        "_id": "string",
        "name": {
          "firstName": "string",
          "lastName": "string"
        },
        "email": "string",
        "phone": "string"
      },
      "numbers": [
        {
          "numberPlayed": "12",
          "amountPlayed": 10,
          "amountWon": 0
        }
      ],
      "totalAmountPlayed": 10,
      "totalAmountWon": 0,
      "status": "ACTIVE",
      "purchasedOn": 1234567890
    }
  ],
  "amount": [
    {
      "totalAmountPlayed": "1000.00",
      "totalAmountWon": "500.00"
    }
  ],
  "lottery": {
    "_id": "string",
    "title": "string",
    "type": "BORLETTE",
    "scheduledTime": 1234567890,
    "state": {
      "_id": "string",
      "name": "string",
      "code": "string"
    },
    "restrictions": {
      "twoDigit": 1000,
      "threeDigit": 500,
      "marriageNumber": 200
    }
  }
}
```

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/507f1f77bcf86cd799439011?offset=0&limit=20&sortBy=purchasedOn&sortOrder=desc', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

---

### 5. Create Lottery

Create a new lottery. Only one lottery of the same type can exist per state at a time (unless the previous one is completed).

**Endpoint:** `POST /api/admin/lottery-management`

**Request Body:**

```json
{
  "title": "Morning Draw",
  "type": "BORLETTE",
  "scheduledTime": 1234567890,
  "state": "507f1f77bcf86cd799439011",
  "jackpotAmount": 1000000,
  "metadata": "morning",
  "restrictions": {
    "twoDigit": 1000,
    "threeDigit": 500,
    "fourDigit": 200,
    "marriageNumber": 100,
    "individualNumber": [
      {
        "number": "12",
        "limit": 50
      }
    ]
  },
  "externalGameIds": {
    "pick3": 12345,
    "pick4": 67890
  },
  "additionalData": {
    "hasMarriageNumbers": true
  }
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Lottery title |
| `type` | string | Yes | Lottery type: `BORLETTE` or `MEGAMILLION` |
| `scheduledTime` | number | Yes | Scheduled draw time (Unix timestamp) |
| `state` | string | Yes | State ID |
| `jackpotAmount` | number | No | Jackpot amount (required for MEGAMILLION, auto-set if not provided) |
| `metadata` | string | No | Lottery metadata (e.g., "morning", "afternoon", "evening") |
| `restrictions` | object | No | Lottery restrictions (see structure above) |
| `externalGameIds` | object | No | External game IDs for integration |
| `additionalData` | object | No | Additional lottery data |

**Response (200 OK):**

```json
{
  "success": true,
  "lottery": {
    "_id": "string",
    "title": "Morning Draw",
    "type": "BORLETTE",
    "scheduledTime": 1234567890,
    "state": "507f1f77bcf86cd799439011",
    "status": "SCHEDULED",
    "createdBy": "507f1f77bcf86cd799439011",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**

- `400 Bad Request`: State ID is required or invalid state specified
- `400 Bad Request`: Please publish previously created lottery for this state and type first
- `409 Conflict`: Validation error or duplicate lottery

**Example Request:**

```javascript
fetch('/api/admin/lottery-management', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Morning Draw',
    type: 'BORLETTE',
    scheduledTime: 1234567890,
    state: '507f1f77bcf86cd799439011',
    metadata: 'morning'
  })
})
```

---

### 6. Update Lottery

Update an existing lottery. Can update state and restrictions.

**Endpoint:** `PUT /api/admin/lottery-management/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Request Body:**

```json
{
  "state": "507f1f77bcf86cd799439011",
  "restrictions": {
    "twoDigit": 1500,
    "threeDigit": 750,
    "marriageNumber": 150
  }
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | New state ID (must be valid) |
| `restrictions` | object | No | Updated restrictions |

**Response (200 OK):**

```json
{
  "success": true,
  "lottery": {
    "_id": "string",
    "title": "Morning Draw",
    "type": "BORLETTE",
    "state": "507f1f77bcf86cd799439011",
    "restrictions": {
      "twoDigit": 1500,
      "threeDigit": 750,
      "marriageNumber": 150
    }
  }
}
```

**Error Responses:**

- `400 Bad Request`: Invalid state specified or invalid parameters
- `500 Internal Server Error`: Server error

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    restrictions: {
      twoDigit: 1500,
      threeDigit: 750
    }
  })
})
```

---

### 7. Preview Lottery Results

Preview lottery results before publishing. Shows potential payouts and winning tickets without actually publishing the results.

**Endpoint:** `PUT /api/admin/lottery-management/preview/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Request Body:**

```json
{
  "numbers": [12, 34, 56]
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `numbers` | array | Yes | Array of 3 winning numbers (for BORLETTE) |

**Response (200 OK):**

```json
{
  "success": true,
  "preview": {
    "totalAmountReceived": 10000,
    "totalAmountWon": 5000,
    "tickets": [
      {
        "_id": "string",
        "user": {
          "_id": "string",
          "name": {
            "firstName": "string",
            "lastName": "string"
          }
        },
        "numbers": [
          {
            "numberPlayed": "12",
            "amountPlayed": 10,
            "amountWon": 600
          }
        ],
        "amountWon": 600,
        "counter": 1
      }
    ],
    "12": {
      "amountReceived": 100,
      "amountWon": 6000,
      "counter": 10
    }
  }
}
```

**Error Responses:**

- `400 Bad Request`: Lottery ID is required or three winning numbers are required
- `404 Not Found`: Lottery not found
- `409 Conflict`: Validation error

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/preview/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    numbers: [12, 34, 56]
  })
})
```

---

### 8. Publish Lottery Results

Publish lottery results. This will finalize the lottery, calculate payouts, and update ticket statuses.

**Endpoint:** `PUT /api/admin/lottery-management/publish/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Request Body:**

For BORLETTE:
```json
{
  "numbers": [12, 34, 56]
}
```

For MEGAMILLION:
```json
{
  "numbers": [1, 2, 3, 4, 5],
  "megaBall": 25
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `numbers` | array | Yes | Array of winning numbers (3 for BORLETTE, 5 for MEGAMILLION) |
| `megaBall` | number | No | Mega ball number (required for MEGAMILLION) |

**Response (200 OK):**

```json
{
  "success": true,
  "publish": {
    "lottery": {
      "_id": "string",
      "status": "COMPLETED",
      "results": {
        "numbers": [12, 34, 56]
      },
      "drawTime": 1234567890
    },
    "totalPayout": 50000,
    "winningTickets": 100
  }
}
```

**Error Responses:**

- `500 Internal Server Error`: Server error during publishing

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/publish/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    numbers: [12, 34, 56]
  })
})
```

---

### 9. Delete Lottery

Delete a lottery. Use with caution as this action cannot be undone.

**Endpoint:** `DELETE /api/admin/lottery-management/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Response (200 OK):**

```json
{
  "success": true
}
```

**Error Responses:**

- `400 Bad Request`: Invalid parameters
- `409 Conflict`: Cannot delete lottery (e.g., has active tickets)

**Example Request:**

```javascript
fetch('/api/admin/lottery-management/507f1f77bcf86cd799439011', {
  method: 'DELETE',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Unauthorized access"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "error": "Conflict error message"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Notes

1. **Authentication**: All endpoints require ADMIN role. Non-admin users will receive a 403 Forbidden response.

2. **Lottery Types**: 
   - `BORLETTE`: State-specific lottery with 3-digit numbers
   - `MEGAMILLION`: Multi-state lottery with 5 numbers + mega ball

3. **State Management**: 
   - Each lottery must be associated with a valid state
   - MEGAMILLION lotteries can be shared across states
   - Only one active lottery per type per state can exist at a time

4. **Restrictions**: Lottery restrictions control betting limits:
   - `twoDigit`: Maximum bet for 2-digit numbers
   - `threeDigit`: Maximum bet for 3-digit numbers
   - `fourDigit`: Maximum bet for 4-digit numbers
   - `marriageNumber`: Maximum bet for marriage numbers
   - `individualNumber`: Array of specific number limits

5. **Preview vs Publish**: 
   - Use `preview` to test results before publishing
   - Use `publish` to finalize results and update ticket statuses
   - Preview does not modify any data

6. **Dashboard Statistics**: 
   - Dashboard provides real-time statistics
   - Periodic stats (today, this week, this month) are calculated dynamically
   - Revenue and profit calculations exclude cancelled tickets

---

## Migration Notes

These endpoints were previously located at `/api/lottery/*` but have been moved to `/api/admin/lottery-management/*` to:
- Separate admin functionality from user-facing endpoints
- Enforce proper role-based access control
- Follow consistent admin module patterns
- Improve code organization and maintainability

User-facing lottery endpoints remain at `/api/lottery/*` and do not require admin access.
