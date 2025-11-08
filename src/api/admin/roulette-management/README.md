# Roulette Management API Documentation

This document provides comprehensive information about the Roulette Management API endpoints for frontend integration.

## Base URL
All endpoints are prefixed with: `/api/admin/roulette-management`

## Authentication
All endpoints require:
- **x-api-key** header
- **Authorization** header with Bearer token (JWT)
- **Role**: ADMIN

---

## Endpoints

### 1. List Roulette Games

Get a paginated list of roulette games with filtering, sorting, and search capabilities.

**Endpoint:** `GET /api/admin/roulette-management`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 20 | Number of items per page |
| `status` | string | No | - | Filter by status: `SCHEDULED`, `COMPLETED`, `CANCELLED` |
| `startDate` | number | No | - | Filter by creation date start (Unix timestamp) |
| `endDate` | number | No | - | Filter by creation date end (Unix timestamp) |
| `sortBy` | string | No | `createdAt` | Sort field (e.g., `createdAt`, `spinSchedlue`, `totalAmountPlayed`, `totalAmountWon`) |
| `sortOrder` | string | No | `desc` | Sort order: `asc` or `desc` |

**Response (200 OK):**

```json
{
  "success": true,
  "roulettes": [
    {
      "_id": "string",
      "spinSchedlue": 1234567890,
      "winningNumber": 7,
      "status": "COMPLETED",
      "statistics": {
        "totalTickets": 100,
        "totalAmountPlayed": 5000,
        "totalAmountWon": 3000,
        "winningTickets": 25,
        "profit": 2000,
        "profitMargin": 40.0
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
fetch('/api/admin/roulette-management?page=1&limit=20&status=COMPLETED&sortBy=spinSchedlue&sortOrder=desc', {
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

### 2. Get Roulette Details

Get comprehensive details about a specific roulette game including all tickets, winning number, winning amounts, and all related data.

**Endpoint:** `GET /api/admin/roulette-management/:id`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Roulette ID |

**Response (200 OK):**

```json
{
  "success": true,
  "rouletteDetails": {
    "roulette": {
      "_id": "string",
      "spinSchedlue": 1234567890,
      "winningNumber": 7,
      "status": "COMPLETED",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "tickets": [
      {
        "_id": "string",
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
        "roulette": "string",
        "bet": [
          {
            "blockPlayed": "red",
            "amountPlayed": 10,
            "amountWon": 10
          },
          {
            "blockPlayed": "7",
            "amountPlayed": 5,
            "amountWon": 175
          }
        ],
        "cashType": "VIRTUAL",
        "totalAmountPlayed": 15,
        "totalAmountWon": 185,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "ticketStatistics": {
      "totalTickets": 100,
      "totalAmountPlayed": 5000,
      "totalAmountWon": 3000,
      "winningTickets": 25,
      "profit": 2000,
      "profitMargin": 40.0
    },
    "winningNumberBreakdown": {
      "winningNumber": 7,
      "betTypeBreakdown": [
        {
          "_id": "red",
          "totalAmountPlayed": 500,
          "totalAmountWon": 500,
          "ticketCount": 50,
          "winningTicketCount": 50
        },
        {
          "_id": "7",
          "totalAmountPlayed": 100,
          "totalAmountWon": 3500,
          "ticketCount": 10,
          "winningTicketCount": 10
        },
        {
          "_id": "odd",
          "totalAmountPlayed": 300,
          "totalAmountWon": 300,
          "ticketCount": 30,
          "winningTicketCount": 30
        }
      ]
    },
    "cashTypeBreakdown": [
      {
        "_id": "REAL",
        "totalAmountPlayed": 2000,
        "totalAmountWon": 1500,
        "ticketCount": 50,
        "winningTicketCount": 15
      },
      {
        "_id": "VIRTUAL",
        "totalAmountPlayed": 3000,
        "totalAmountWon": 1500,
        "ticketCount": 50,
        "winningTicketCount": 10
      }
    ],
    "userBreakdown": [
      {
        "userId": "string",
        "userName": "string",
        "email": "string",
        "totalAmountPlayed": 500,
        "totalAmountWon": 300,
        "ticketCount": 5,
        "winningTicketCount": 2
      }
    ]
  }
}
```

**Example Request:**

```javascript
// Using fetch
fetch('/api/admin/roulette-management/507f1f77bcf86cd799439011', {
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

- `404 Not Found`: Roulette game not found
```json
{
  "success": false,
  "error": "Roulette game not found"
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

### 3. Set Temporary Winning Number

Set (or clear) a temporary winning number that applies globally to all roulette games. When set, every roulette spin will use the provided number instead of a random value until the override is cleared or expires.

**Endpoint:** `POST /api/admin/roulette-management/temporary-winning-number`

**Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `winningNumber` | number | No | Integer between `0` and `36`. Omit or set to `null` to clear an existing override. |
| `expiresAt` | string \| number | No | ISO date string or timestamp representing when the temporary value should expire. Must be in the future. |
| `expiresInSeconds` | number | No | Convenience alternative to `expiresAt`. Number of seconds from now before the override expires. |

At most one of `expiresAt` and `expiresInSeconds` should be provided.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Temporary winning number set",
  "temporaryWinningNumber": 7,
  "temporaryWinningNumberExpiresAt": "2024-01-01T00:00:30.000Z",
  "temporaryWinningNumberSetAt": "2024-01-01T00:00:00.000Z",
  "temporaryWinningNumberSetBy": "660a58c4c1f19b7f5c0f8331"
}
```

**Clearing the override:**

```http
POST /api/admin/roulette-management/temporary-winning-number
Content-Type: application/json

{
  "winningNumber": null
}
```

**Error Responses:**

- `400 Bad Request`: Invalid roulette status or invalid body parameters
- `404 Not Found`: Roulette game not found
- `500 Internal Server Error`: Server error

---

## Status Values

The following status values are used for roulette game status:

- `SCHEDULED`: Roulette game is scheduled but not yet completed
- `COMPLETED`: Roulette game has been completed with a winning number
- `CANCELLED`: Roulette game has been cancelled

---

## Cash Types

- `REAL`: Real money transactions
- `VIRTUAL`: Virtual currency transactions

---

## Bet Types

Roulette supports various bet types:

### Single Number Bets
- Numbers `0-36`: Direct bet on a specific number (pays 35:1)

### Color Bets
- `red`: Bet on red numbers (pays 1:1)
- `black`: Bet on black numbers (pays 1:1)

### Odd/Even Bets
- `odd`: Bet on odd numbers (pays 1:1)
- `even`: Bet on even numbers (pays 1:1)

### Range Bets
- `1_18`: Bet on numbers 1-18 (pays 1:1)
- `19_36`: Bet on numbers 19-36 (pays 1:1)

### Column Bets (2 to 1)
- `2_to_1_1`: First column (3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36) (pays 2:1)
- `2_to_1_2`: Second column (2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35) (pays 2:1)
- `2_to_1_3`: Third column (1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34) (pays 2:1)

### Dozen Bets
- `1_12`: First dozen (1-12) (pays 2:1)
- `2_12`: Second dozen (13-24) (pays 2:1)
- `3_12`: Third dozen (25-36) (pays 2:1)

### Split, Street, Corner, and Line Bets
- Split bets (2 numbers): Format `N1_N2` (pays 17:1)
- Street bets (3 numbers): Format `N1_N2_N3` (pays 11:1)
- Corner bets (4 numbers): Format `N1_N2_N3_N4` (pays 8:1)
- Line bets (6 numbers): Format `N1_N2_N3_N4_N5_N6` (pays 5:1)

---

## Notes

1. **Pagination**: All list endpoints support pagination. Use `page` and `limit` query parameters to control the results.

2. **Filtering**: Multiple filters can be combined. For example, you can filter by both `status` and date range simultaneously.

3. **Sorting**: You can sort by any field in the roulette document. Common sort fields include:
   - `createdAt`: Creation date
   - `spinSchedlue`: Scheduled spin time
   - `totalAmountPlayed`: Total amount played (requires aggregation)
   - `totalAmountWon`: Total amount won (requires aggregation)
   - `winningNumber`: Winning number (for completed games)

4. **Date Filters**: Date filters accept Unix timestamps in milliseconds. You can use `Date.now()` or `new Date().getTime()` in JavaScript to generate timestamps.

5. **Authentication**: All endpoints require admin authentication. Ensure you include the `x-api-key` header and `Authorization` header with a valid admin JWT token.

6. **Winning Number**: The winning number is only available for games with status `COMPLETED`. It will be `null` for `SCHEDULED` games.

7. **Ticket Statistics**: Statistics include profit calculations (totalAmountPlayed - totalAmountWon) and profit margin percentage.

8. **User Breakdown**: The user breakdown in details endpoint shows the top 10 players by total amount played for the specific roulette game.

---

## Example Usage Scenarios

### Scenario 1: List all completed roulette games

```javascript
const response = await fetch(
  '/api/admin/roulette-management?status=COMPLETED&page=1&limit=20&sortBy=spinSchedlue&sortOrder=desc',
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
```

### Scenario 2: Get detailed information about a specific roulette game

```javascript
const rouletteId = '507f1f77bcf86cd799439011';
const response = await fetch(
  `/api/admin/roulette-management/${rouletteId}`,
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
```

### Scenario 3: Filter roulette games by date range

```javascript
const startDate = new Date('2024-01-01').getTime();
const endDate = new Date('2024-01-31').getTime();
const response = await fetch(
  `/api/admin/roulette-management?startDate=${startDate}&endDate=${endDate}&page=1&limit=20`,
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
  }
);
const data = await response.json();
```

### Scenario 4: Sort by total amount played

```javascript
const response = await fetch(
  '/api/admin/roulette-management?sortBy=totalAmountPlayed&sortOrder=desc&page=1&limit=20',
  {
    headers: {
      'x-api-key': 'your-api-key',
      'Authorization': 'Bearer your-jwt-token'
    }
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

