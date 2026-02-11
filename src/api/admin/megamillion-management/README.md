# Megamillion Management API Documentation

This document provides comprehensive information about the Megamillion Management API endpoints for frontend integration.

## Base URL
All endpoints are prefixed with: `/api/admin/megamillion-management`

## Authentication
All endpoints require:
- **x-api-key** header
- **Authorization** header with Bearer token (JWT)
- **Role**: ADMIN

---

## Endpoints

### 1. List Megamillion Lotteries

Get a paginated list of megamillion lotteries with filtering, sorting, and search capabilities.

**Endpoint:** `GET /api/admin/megamillion-management`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 20 | Number of items per page |
| `status` | string | No | - | Filter by status: `SCHEDULED`, `WAITING`, `COMPLETED`, `CANCELLED`, `ERROR` |
| `stateId` | string | No | - | Filter by state ID |
| `type` | string | No | `MEGAMILLION` | Lottery type (default: MEGAMILLION) |
| `startDate` | number | No | - | Filter by creation date start (Unix timestamp) |
| `endDate` | number | No | - | Filter by creation date end (Unix timestamp) |
| `search` | string | No | - | Search by title or metadata (case-insensitive) |
| `sortBy` | string | No | `createdAt` | Sort field (e.g., `createdAt`, `scheduledTime`, `drawTime`) |
| `sortOrder` | string | No | `desc` | Sort order: `asc` or `desc` |

**Response (200 OK):**

```json
{
  "success": true,
  "lotteries": [
    {
      "_id": "string",
      "title": "string",
      "type": "MEGAMILLION",
      "scheduledTime": 1234567890,
      "drawTime": 1234567890,
      "drawNumber": 12345,
      "jackpotAmount": 0,
      "metadata": "string",
      "results": {
        "numbers": [1, 2, 3, 4, 5],
        "megaBall": 25
      },
      "status": "SCHEDULED",
      "state": {
        "_id": "string",
        "name": "string",
        "code": "string"
      },
      "createdBy": {
        "_id": "string",
        "name": {
          "firstName": "string",
          "lastName": "string"
        },
        "userName": "string",
        "email": "string"
      },
      "statistics": {
        "totalTickets": 100,
        "totalAmountPlayed": 200,
        "totalAmountWon": 150,
        "winningTickets": 25,
        "profit": 50,
        "profitMargin": 25.0
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
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

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management?page=1&limit=20&status=COMPLETED&sortBy=scheduledTime&sortOrder=desc', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 2. Get Megamillion Details

Get comprehensive details about a specific megamillion lottery including all tickets, winning numbers, winning amounts, lottery configuration, and restrictions.

**Endpoint:** `GET /api/admin/megamillion-management/:id`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Lottery ID |

**Response (200 OK):**

```json
{
  "success": true,
  "lotteryDetails": {
    "lottery": {
      "_id": "string",
      "title": "string",
      "type": "MEGAMILLION",
      "scheduledTime": 1234567890,
      "drawTime": 1234567890,
      "drawNumber": 12345,
      "jackpotAmount": 0,
      "metadata": "string",
      "results": {
        "numbers": [1, 2, 3, 4, 5],
        "megaBall": 25
      },
      "status": "COMPLETED",
      "state": {
        "_id": "string",
        "name": "string",
        "code": "string"
      },
      "createdBy": {
        "_id": "string",
        "name": {
          "firstName": "string",
          "lastName": "string"
        },
        "userName": "string",
        "email": "string"
      },
      "externalGameIds": {
        "megaMillions": 123
      },
      "additionalData": {
        "hasMarriageNumbers": false
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "tickets": [
      {
        "_id": 1234567890,
        "user": {
          "_id": "string",
          "name": {
            "firstName": "string",
            "lastName": "string"
          },
          "userName": "string",
          "email": "string",
          "phone": "string"
        },
        "lottery": "string",
        "numbers": [1, 2, 3, 4, 5],
        "megaBall": 25,
        "amountPlayed": 2,
        "amountWon": 10,
        "isAmountDisbursed": true,
        "purchasedBy": "USER",
        "purchasedOn": 1234567890,
        "status": "COMPLETED",
        "cashType": "VIRTUAL",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "ticketStatistics": {
      "totalTickets": 100,
      "totalAmountPlayed": 200,
      "totalAmountWon": 150,
      "winningTickets": 25,
      "activeTickets": 0,
      "completedTickets": 100,
      "cancelledTickets": 0,
      "profit": 50,
      "profitMargin": 25.0
    },
    "restrictions": {
      "_id": "string",
      "lottery": "string",
      "twoDigit": 1000,
      "threeDigit": 500,
      "fourDigit": 200,
      "marriageNumber": 300,
      "individualNumber": [
        {
          "number": "12",
          "limit": 50
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "winningNumbersBreakdown": {
      "winningNumbers": ["1", "2", "3", "4", "5"],
      "winningMegaBall": "25",
      "numberBreakdown": [
        {
          "_id": 12,
          "totalAmountPlayed": 50,
          "totalAmountWon": 200,
          "ticketCount": 25
        }
      ],
      "megaBallBreakdown": [
        {
          "_id": 25,
          "totalAmountPlayed": 30,
          "totalAmountWon": 150,
          "ticketCount": 15
        }
      ]
    },
    "cashTypeBreakdown": [
      {
        "_id": "REAL",
        "totalAmountPlayed": 100,
        "totalAmountWon": 75,
        "ticketCount": 50
      },
      {
        "_id": "VIRTUAL",
        "totalAmountPlayed": 100,
        "totalAmountWon": 75,
        "ticketCount": 50
      }
    ]
  }
}
```

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management/507f1f77bcf86cd799439011', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `404 Not Found`: Lottery not found
```json
{
  "success": false,
  "error": "Lottery not found"
}
```

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 3. Create Lottery Restrictions

Create restrictions for a megamillion lottery. Restrictions limit betting amounts for specific number types.

**Endpoint:** `POST /api/admin/megamillion-management/restrictions`

**Request Body:**

```json
{
  "lotteryId": "507f1f77bcf86cd799439011",
  "twoDigit": 1000,
  "threeDigit": 500,
  "fourDigit": 200,
  "marriageNumber": 300,
  "individualNumber": [
    {
      "number": "12",
      "limit": 50
    },
    {
      "number": "34",
      "limit": 75
    }
  ]
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lotteryId` | string | Yes | Lottery ID (must be a MEGAMILLION lottery) |
| `twoDigit` | number | No | Maximum bet amount for two-digit numbers |
| `threeDigit` | number | No | Maximum bet amount for three-digit numbers |
| `fourDigit` | number | No | Maximum bet amount for four-digit numbers |
| `marriageNumber` | number | No | Maximum bet amount for marriage numbers |
| `individualNumber` | array | No | Array of individual number restrictions |

**Individual Number Object:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `number` | string | Yes | The number to restrict (e.g., "12", "345") |
| `limit` | number | Yes | Maximum bet amount for this specific number |

**Response (201 Created):**

```json
{
  "success": true,
  "message": "Lottery restriction created successfully",
  "restriction": {
    "_id": "string",
    "lottery": "507f1f77bcf86cd799439011",
    "twoDigit": 1000,
    "threeDigit": 500,
    "fourDigit": 200,
    "marriageNumber": 300,
    "individualNumber": [
      {
        "number": "12",
        "limit": 50
      },
      {
        "number": "34",
        "limit": 75
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management/restrictions', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    lotteryId: '507f1f77bcf86cd799439011',
    twoDigit: 1000,
    threeDigit: 500,
    fourDigit: 200,
    marriageNumber: 300,
    individualNumber: [
      {
        number: '12',
        limit: 50
      }
    ]
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `400 Bad Request`: Missing required fields or invalid data
```json
{
  "success": false,
  "error": "Lottery ID is required"
}
```

- `400 Bad Request`: Invalid lottery type
```json
{
  "success": false,
  "error": "Restrictions can only be created for MEGAMILLION lotteries"
}
```

- `400 Bad Request`: Invalid individualNumber format
```json
{
  "success": false,
  "error": "Each individualNumber must have both number and limit fields"
}
```

- `404 Not Found`: Lottery not found
```json
{
  "success": false,
  "error": "Lottery not found"
}
```

- `409 Conflict`: Restrictions already exist
```json
{
  "success": false,
  "error": "Restrictions already exist for this lottery. Use update endpoint to modify."
}
```

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 4. Update Lottery Restrictions

Update existing restrictions for a megamillion lottery.

**Endpoint:** `PUT /api/admin/megamillion-management/restrictions/:lotteryId`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lotteryId` | string | Yes | Lottery ID |

**Request Body:**

```json
{
  "twoDigit": 1200,
  "threeDigit": 600,
  "fourDigit": 250,
  "marriageNumber": 350,
  "individualNumber": [
    {
      "number": "12",
      "limit": 60
    },
    {
      "number": "34",
      "limit": 80
    }
  ]
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `twoDigit` | number | No | Maximum bet amount for two-digit numbers |
| `threeDigit` | number | No | Maximum bet amount for three-digit numbers |
| `fourDigit` | number | No | Maximum bet amount for four-digit numbers |
| `marriageNumber` | number | No | Maximum bet amount for marriage numbers |
| `individualNumber` | array | No | Array of individual number restrictions |

**Note:** Only include the fields you want to update. Fields not included in the request will remain unchanged.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Lottery restriction updated successfully",
  "restriction": {
    "_id": "string",
    "lottery": "507f1f77bcf86cd799439011",
    "twoDigit": 1200,
    "threeDigit": 600,
    "fourDigit": 250,
    "marriageNumber": 350,
    "individualNumber": [
      {
        "number": "12",
        "limit": 60
      },
      {
        "number": "34",
        "limit": 80
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management/restrictions/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    twoDigit: 1200,
    threeDigit: 600,
    individualNumber: [
      {
        number: '12',
        limit: 60
      }
    ]
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `400 Bad Request`: Invalid lottery type
```json
{
  "success": false,
  "error": "Restrictions can only be updated for MEGAMILLION lotteries"
}
```

- `400 Bad Request`: Invalid individualNumber format
```json
{
  "success": false,
  "error": "Each individualNumber must have both number and limit fields"
}
```

- `404 Not Found`: Lottery not found
```json
{
  "success": false,
  "error": "Lottery not found"
}
```

- `404 Not Found`: Restrictions not found
```json
{
  "success": false,
  "error": "Restrictions not found for this lottery. Use create endpoint to create restrictions."
}
```

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 5. Get Default Jackpot Amount

Get the current default jackpot amount that will be used when creating new MEGAMILLION lotteries.

**Endpoint:** `GET /api/admin/megamillion-management/default-jackpot`

**Response (200 OK):**

```json
{
  "success": true,
  "defaultJackpotAmount": 1000000,
  "config": {
    "_id": "string",
    "lotteryType": "MEGAMILLION",
    "defaultJackpotAmount": 1000000,
    "updatedBy": "string",
    "description": "Default jackpot amount set to $1,000,000",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Note:** If no configuration exists, `defaultJackpotAmount` will be `1000000` (1 million) and `config` will be `null`.

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management/default-jackpot', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 6. Get Default Jackpot Amount

Get the current default jackpot amount and description configuration for MEGAMILLION lotteries.

**Endpoint:** `GET /api/admin/megamillion-management/default-jackpot`

**Response (200 OK):**

```json
{
  "success": true,
  "jackpotAmount": 2000000,
  "description": "2 Million",
  "config": {
    "_id": "string",
    "lotteryType": "MEGAMILLION",
    "jackpotAmount": 2000000,
    "description": "2 Million",
    "updatedBy": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Error Responses:**

- `404 Not Found`: Default jackpot amount not configured
```json
{
  "success": false,
  "error": "Default jackpot amount is not configured for MEGAMILLION"
}
```

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 7. Set Default Jackpot Amount

Set or update the default jackpot amount and description that will be used when creating new MEGAMILLION lotteries. This value will be automatically applied to all newly created MEGAMILLION lotteries unless a specific `jackpotAmount` is provided during creation.

**Endpoint:** `PUT /api/admin/megamillion-management/default-jackpot`

**Request Body:**

```json
{
  "jackpotAmount": 2000000,
  "description": "2 Million"
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jackpotAmount` | number | Yes | The default jackpot amount as a number (must be a positive number) |
| `description` | string | No | The display description for the jackpot (e.g., "2 Million", "100 Thousands") |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Default jackpot amount for MEGAMILLION set to 2000000",
  "jackpotAmount": 2000000,
  "description": "2 Million",
  "config": {
    "_id": "string",
    "lotteryType": "MEGAMILLION",
    "jackpotAmount": 2000000,
    "description": "2 Million",
    "updatedBy": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/megamillion-management/default-jackpot', {
  method: 'PUT',
  headers: {
    'x-api-key': 'your-api-key',
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jackpotAmount: 2000000,
    description: '2 Million'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

**Error Responses:**

- `404 Not Found`: Default jackpot amount not configured
```json
{
  "success": false,
  "error": "Default jackpot amount is not configured for MEGAMILLION"
}
```

- `400 Bad Request`: Missing or invalid jackpotAmount
```json
{
  "success": false,
  "error": "Jackpot amount is required"
}
```

- `400 Bad Request`: Invalid jackpot amount value
```json
{
  "success": false,
  "error": "Jackpot amount must be a valid number"
}
```

- `500 Internal Server Error`: Server error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Status Values

The following status values are used for lottery status:

- `SCHEDULED`: Lottery is scheduled but not yet drawn
- `WAITING`: Lottery is waiting for results
- `COMPLETED`: Lottery has been completed with results
- `CANCELLED`: Lottery has been cancelled
- `ERROR`: An error occurred during lottery processing

---

## Cash Types

- `REAL`: Real money transactions
- `VIRTUAL`: Virtual currency transactions

---

## Ticket Status Values

- `ACTIVE`: Ticket is active and awaiting results
- `COMPLETED`: Ticket has been processed with results
- `CANCELLED`: Ticket has been cancelled

---

## Notes

1. **Pagination**: All list endpoints support pagination. Use `page` and `limit` query parameters to control the results.

2. **Filtering**: Multiple filters can be combined. For example, you can filter by both `status` and `stateId` simultaneously.

3. **Sorting**: You can sort by any field in the lottery document. Common sort fields include:
   - `createdAt`: Creation date
   - `scheduledTime`: Scheduled draw time
   - `drawTime`: Actual draw time

4. **Search**: The search parameter performs a case-insensitive search on the `title` and `metadata` fields.

5. **Restrictions**: Once restrictions are created for a lottery, they cannot be created again. Use the update endpoint (`PUT /api/admin/megamillion-management/restrictions/:lotteryId`) to modify existing restrictions.

6. **Date Filters**: Date filters accept Unix timestamps in milliseconds. You can use `Date.now()` or `new Date().getTime()` in JavaScript to generate timestamps.

7. **Authentication**: All endpoints require admin authentication. Ensure you include the `x-api-key` header and `Authorization` header with a valid admin JWT token.

8. **Megamillion Specifics**: 
   - Megamillion tickets have a fixed price of $2 per ticket
   - Each ticket contains 5 numbers (from 1-70) and 1 mega ball number (from 1-25)
   - Winning numbers breakdown includes both regular numbers and mega ball numbers

9. **Default Jackpot Amount**: 
   - The default jackpot amount is used when creating new MEGAMILLION lotteries
   - If no default is configured, the system uses 1,000,000 (1 million) as the default
   - Admins can set/update the default jackpot amount and description using the default-jackpot endpoints
   - When manually creating a lottery via the create endpoint, if `jackpotAmount` is not provided, the configured default will be used
   - The default jackpot amount applies to all newly created MEGAMILLION lotteries automatically
   - Both `jackpotAmount` (number) and `description` (string) are stored and returned in API responses
   - The `description` is used for display purposes in the UI, while `jackpotAmount` is used for calculations

---

## Example Usage Scenarios

### Scenario 1: List all completed megamillion lotteries for a specific state

```javascript
const stateId = '507f1f77bcf86cd799439011';
const response = await fetch(
  `/api/admin/megamillion-management?status=COMPLETED&stateId=${stateId}&page=1&limit=20`,
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
```

### Scenario 2: Get detailed information about a specific lottery

```javascript
const lotteryId = '507f1f77bcf86cd799439011';
const response = await fetch(
  `/api/admin/megamillion-management/${lotteryId}`,
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
```

### Scenario 3: Create restrictions for a lottery

```javascript
const restrictionData = {
  lotteryId: '507f1f77bcf86cd799439011',
  twoDigit: 1000,
  threeDigit: 500,
  marriageNumber: 300,
  individualNumber: [
    { number: '12', limit: 50 },
    { number: '34', limit: 75 }
  ]
};

const response = await fetch(
  '/api/admin/megamillion-management/restrictions',
  {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(restrictionData)
  }
);
const data = await response.json();
```

### Scenario 4: Update restrictions for a lottery

```javascript
const lotteryId = '507f1f77bcf86cd799439011';
const updateData = {
  twoDigit: 1200,
  threeDigit: 600,
  individualNumber: [
    { number: '12', limit: 60 }
  ]
};

const response = await fetch(
  `/api/admin/megamillion-management/restrictions/${lotteryId}`,
  {
    method: 'PUT',
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  }
);
const data = await response.json();
```

### Scenario 5: Get the current default jackpot amount

```javascript
const response = await fetch(
  '/api/admin/megamillion-management/default-jackpot',
  {
    method: 'GET',
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
console.log(`Current default jackpot: $${data.entity.defaultJackpotAmount.toLocaleString()}`);
```

### Scenario 6: Set a new default jackpot amount

```javascript
const response = await fetch(
  '/api/admin/megamillion-management/default-jackpot',
  {
    method: 'PUT',
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      defaultJackpotAmount: 2500000,
      description: 'Increased default jackpot to $2.5 million for promotional period'
    })
  }
);
const data = await response.json();
```

---

## Error Handling

Always check the `success` field in the response to determine if the request was successful:

```javascript
const response = await fetch(url, options);
const data = await response.json();

if (data.success) {
  // Handle success
  console.log(data.entity);
} else {
  // Handle error
  console.error(data.entity.error);
}
```

---

## Support

For issues or questions regarding these endpoints, please contact the development team.

