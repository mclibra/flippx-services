# Lottery API Documentation

This API provides endpoints for managing and querying lottery information, including upcoming lotteries, completed lotteries, user tickets, and popular numbers.

## Base URL

All endpoints are prefixed with `/api/lottery` (or the configured API prefix).

## Authentication

All endpoints require authentication via Bearer token. Include the token in the request headers:

```
Authorization: Bearer <your-token>
```

Additionally, all endpoints require the `x-api-key` header.

---

## Endpoints

### 1. List Lotteries

Get a paginated list of lotteries with optional filtering.

**Endpoint:** `GET /`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `offset` | number | No | Number of records to skip (default: 0) |
| `limit` | number | No | Maximum number of records to return (default: 10) |
| `type` | string | No | Filter by lottery type (e.g., "BORLETTE", "MEGAMILLION") |
| `stateId` | string | No | Filter by state ID. For MEGAMILLION, this filter is ignored as it's shared across all states |
| `status` | string | No | Filter by status (e.g., "SCHEDULED", "COMPLETED", "CANCELLED") |
| `startDate` | number | No | Start date filter (Unix timestamp in milliseconds) |
| `endDate` | number | No | End date filter (Unix timestamp in milliseconds) |
| `key` | string | No | Search key for title or metadata (case-insensitive) |
| `sortBy` | string | No | Field to sort by (default: "createdAt") |
| `sortOrder` | string | No | Sort order: "asc" or "desc" (default: "desc") |

**Response:**

```json
{
  "success": true,
  "lotteries": [
    {
      "id": "string",
      "title": "string",
      "type": "BORLETTE" | "MEGAMILLION",
      "scheduledTime": 1234567890,
      "drawTime": 1234567890,
      "drawNumber": 123,
      "jackpotAmount": 1000000,
      "metadata": "string",
      "results": {},
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "externalGameIds": {
        "pick3": 123,
        "pick4": 456,
        "megaMillions": 789
      },
      "additionalData": {
        "hasMarriageNumbers": true
      },
      "status": "SCHEDULED" | "WAITING" | "COMPLETED" | "CANCELLED" | "ERROR",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 100
}
```

**Example Request:**

```bash
GET /api/lottery?type=BORLETTE&stateId=507f1f77bcf86cd799439011&limit=20&offset=0
```

---

### 2. Get Next Upcoming Lotteries

Get the next upcoming lotteries with countdown information.

**Endpoint:** `GET /next`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by lottery type (e.g., "BORLETTE", "MEGAMILLION") |
| `stateId` | string | No | Filter by state ID. For MEGAMILLION, this filter is ignored |
| `limit` | number | No | Maximum number of records to return (default: 10) |
| `offset` | number | No | Number of records to skip (default: 0) |

**Response:**

```json
{
  "success": true,
  "lotteries": [
    {
      "id": "string",
      "title": "string",
      "type": "BORLETTE" | "MEGAMILLION",
      "scheduledTime": 1234567890,
      "jackpotAmount": 1000000,
      "metadata": "string",
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "status": "SCHEDULED",
      "countdown": 3600000
    }
  ],
  "total": 5,
  "nextLottery": {
    "id": "string",
    "title": "string",
    "type": "BORLETTE",
    "scheduledTime": 1234567890,
    "countdown": 3600000
  }
}
```

**Notes:**
- Only returns lotteries with status "SCHEDULED" and scheduledTime in the future
- `countdown` is in milliseconds (time remaining until scheduledTime)
- `nextLottery` contains the closest upcoming lottery

**Example Request:**

```bash
GET /api/lottery/next?type=BORLETTE&stateId=507f1f77bcf86cd799439011&limit=5
```

---

### 3. Get Closest Upcoming Lottery by State

Get the closest upcoming lottery for each active state, along with last winning numbers.

**Endpoint:** `GET /closest-by-state`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | **Yes** | Lottery type: "BORLETTE" or "MEGAMILLION" |

**Response:**

```json
{
  "success": true,
  "states": [
    {
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "lottery": {
        "id": "string",
        "title": "string",
        "type": "BORLETTE" | "MEGAMILLION",
        "scheduledTime": 1234567890,
        "jackpotAmount": 1000000,
        "metadata": "string",
        "status": "SCHEDULED",
        "countdown": 3600000
      },
      "lastWinning": {
        "lotteryId": "string",
        "title": "string",
        "type": "BORLETTE" | "MEGAMILLION",
        "metadata": "string",
        "drawTime": 1234567890,
        "results": {}
      }
    }
  ],
  "total": 10,
  "summary": {
    "totalStates": 10,
    "statesWithUpcomingLotteries": 8,
    "statesWithoutUpcomingLotteries": 2,
    "statesWithLastWinnings": 9
  }
}
```

**Notes:**
- Returns data for all active states
- For MEGAMILLION, the same lottery is returned for all states (shared lottery)
- For BORLETTE, each state has its own lottery
- States without upcoming lotteries will have `lottery: null` and a message
- `lastWinning` may be `null` if no completed lottery exists for that state

**Example Request:**

```bash
GET /api/lottery/closest-by-state?type=BORLETTE
```

---

### 4. Get Last Completed Lotteries

Get the most recently completed lotteries.

**Endpoint:** `GET /last`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | **Yes** | Lottery type (e.g., "BORLETTE", "MEGAMILLION") |
| `stateId` | string | No | Filter by state ID. For MEGAMILLION, this filter is ignored |
| `metadata` | string | No | Filter by metadata (lottery session name) |
| `startDate` | number | No | Start date filter for scheduledTime (Unix timestamp in milliseconds) |
| `endDate` | number | No | End date filter for scheduledTime (Unix timestamp in milliseconds) |
| `offset` | number | No | Number of records to skip (default: 0) |
| `count` | number | No | Number of records to return (default: 1) |

**Response:**

```json
{
  "success": true,
  "lotteries": [
    {
      "id": "string",
      "title": "string",
      "type": "BORLETTE" | "MEGAMILLION",
      "scheduledTime": 1234567890,
      "drawTime": 1234567890,
      "drawNumber": 123,
      "jackpotAmount": 1000000,
      "metadata": "string",
      "results": {},
      "state": {
        "id": "string",
        "name": "string",
        "code": "string"
      },
      "status": "COMPLETED",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "offset": 0,
    "count": 1,
    "total": 50,
    "hasMore": true
  }
}
```

**Notes:**
- Only returns lotteries with status "COMPLETED"
- Results are sorted by `drawTime` in descending order (most recent first)
- Use `count` parameter to retrieve multiple completed lotteries
- `startDate` and `endDate` filter by the lottery's `scheduledTime` field (Unix timestamp in milliseconds)
- Both `startDate` and `endDate` can be used together to define a date range

**Example Request:**

```bash
GET /api/lottery/last?type=BORLETTE&stateId=507f1f77bcf86cd799439011&count=5&startDate=1704067200000&endDate=1704153600000
```

---

### 5. Get Popular Numbers

Get popular lottery numbers for a specific state or globally.

**Endpoint:** `GET /popular-numbers`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stateId` | string | No | State ID. If not provided, returns global popular numbers |

**Response:**

**With stateId:**

```json
{
  "success": true,
  "popularNumbers": {
    "state": {
      "id": "string",
      "name": "string",
      "code": "string"
    },
    "numbers": ["12", "34", "567"],
    "isGlobal": false
  }
}
```

**Without stateId (global):**

```json
{
  "success": true,
  "popularNumbers": {
    "state": null,
    "numbers": ["12", "34", "567"],
    "isGlobal": true
  }
}
```

**Notes:**
- If state-specific popular numbers don't exist, falls back to global numbers
- Numbers are strings of 2 or 3 digits
- `isGlobal` indicates whether the returned numbers are state-specific or global

**Example Request:**

```bash
GET /api/lottery/popular-numbers?stateId=507f1f77bcf86cd799439011
```

---

### 6. Get Lottery Details with User Tickets

Get detailed information about a specific lottery, including user's tickets and aggregated amounts.

**Endpoint:** `GET /:id`

**Authentication:** Required

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | **Yes** | Lottery ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `offset` | number | No | Number of tickets to skip (default: 0) |
| `limit` | number | No | Maximum number of tickets to return (default: 10) |
| `startDate` | number | No | Start date filter for tickets (Unix timestamp in milliseconds) |
| `endDate` | number | No | End date filter for tickets (Unix timestamp in milliseconds) |
| `sortBy` | string | No | Field to sort tickets by (default: "purchasedOn") |
| `sortOrder` | string | No | Sort order: "asc" or "desc" (default: "desc") |

**Response:**

**For BORLETTE:**

```json
{
  "success": true,
  "total": 25,
  "ticketList": [
    {
      "id": "string",
      "lottery": "string",
      "user": {
        "id": "string",
        "name": "string",
        "email": "string",
        "phone": "string"
      },
      "numbers": {},
      "totalAmountPlayed": 10.00,
      "totalAmountWon": 0.00,
      "status": "string",
      "purchasedOn": 1234567890,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "amount": [
    {
      "totalAmountPlayed": "100.00",
      "totalAmountWon": "50.00"
    }
  ],
  "lottery": {
    "id": "string",
    "title": "string",
    "type": "BORLETTE",
    "scheduledTime": 1234567890,
    "state": {
      "id": "string",
      "name": "string",
      "code": "string"
    },
    "restrictions": {
      "twoDigit": 100,
      "threeDigit": 50,
      "fourDigit": 25,
      "marriageNumber": 10,
      "individualNumber": [
        {
          "number": "12",
          "limit": 5
        }
      ]
    }
  }
}
```

**For MEGAMILLION:**

```json
{
  "success": true,
  "total": 15,
  "ticketList": [
    {
      "id": "string",
      "lottery": "string",
      "user": {
        "id": "string",
        "name": "string",
        "email": "string",
        "phone": "string"
      },
      "numbers": {},
      "amountPlayed": 2.00,
      "amountWon": 0.00,
      "status": "string",
      "purchasedOn": 1234567890,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "amount": [
    {
      "totalAmountPlayed": "30.00",
      "totalAmountWon": "0.00"
    }
  ],
  "lottery": {
    "id": "string",
    "title": "Mega Millions",
    "type": "MEGAMILLION",
    "scheduledTime": 1234567890,
    "jackpotAmount": 1000000,
    "state": {
      "id": "string",
      "name": "string",
      "code": "string"
    }
  }
}
```

**Notes:**
- Only returns tickets belonging to the authenticated user
- Amounts are aggregated excluding cancelled tickets
- For BORLETTE, includes lottery restrictions if available
- Ticket structure differs between BORLETTE and MEGAMILLION

**Example Request:**

```bash
GET /api/lottery/507f1f77bcf86cd799439011?limit=20&offset=0&sortBy=purchasedOn&sortOrder=desc
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message or error object"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error

---

## Lottery Types

- **BORLETTE**: State-specific lottery with multiple daily draws
- **MEGAMILLION**: Multi-state lottery shared across all states

## Lottery Statuses

- **SCHEDULED**: Lottery is scheduled for a future draw
- **WAITING**: Lottery is waiting for results
- **COMPLETED**: Lottery has been completed with results
- **CANCELLED**: Lottery has been cancelled
- **ERROR**: An error occurred during lottery processing

---

## Notes

1. **MEGAMILLION State Filtering**: MEGAMILLION lotteries are shared across all states. When filtering by `stateId`, the filter is ignored for MEGAMILLION type lotteries.

2. **Time Formats**: 
   - `scheduledTime` and `drawTime` are Unix timestamps in milliseconds
   - Date filters (`startDate`, `endDate`) should be Unix timestamps in milliseconds

3. **Pagination**: Most list endpoints support pagination via `offset` and `limit` parameters.

4. **User Tickets**: The `/:id` endpoint only returns tickets belonging to the authenticated user.

5. **Popular Numbers**: Numbers are stored as strings and must be 2 or 3 digits. If state-specific numbers don't exist, the API falls back to global numbers.
