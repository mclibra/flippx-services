# Ticket & Game Details API Documentation

## Overview
This document provides detailed API endpoints for retrieving ticket and game details across different game types in the FlippX platform.

---

## 1. Borlette Ticket Details

### Get Borlette Ticket by ID

Retrieves detailed information about a specific Borlette ticket.

**Endpoint:** `GET /borlette_ticket/:id`

**Authentication:** Required (Bearer Token)

**Authorization:** 
- Users can only view their own tickets
- Admins can view any ticket

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | Number | Yes | The unique ticket ID |

**Request Headers:**
```
Authorization: Bearer <token>
X-API-Key: <api-key>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "ticket": {
    "id": "12345",
    "user": {
      "id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "USER"
    },
    "lottery": {
      "id": "lottery456",
      "name": "Evening Draw",
      "state": {
        "id": "state789",
        "name": "New York",
        "code": "NY"
      },
      "drawTime": "2025-10-15T18:00:00.000Z",
      "status": "COMPLETED",
      "result": "123"
    },
    "numbers": [
      {
        "number": "123",
        "amount": 10,
        "multiplier": 1,
        "amountWon": 0
      }
    ],
    "totalAmount": 10,
    "totalAmountWon": 0,
    "cashType": "REAL",
    "status": "LOST",
    "createdAt": "2025-10-15T17:30:00.000Z",
    "updatedAt": "2025-10-15T18:05:00.000Z"
  }
}
```

**Error Responses:**

*400 Bad Request:*
```json
{
  "success": false,
  "error": "Invalid ticket ID. ID must be numeric."
}
```

*404 Not Found:*
```json
{
  "success": false,
  "error": "Ticket not found or access denied."
}
```

*409 Conflict:*
```json
{
  "success": false,
  "error": "Database error message"
}
```

---

## 2. Megamillion Ticket Details

### Get Megamillion Ticket by ID

Retrieves detailed information about a specific Megamillion ticket.

**Endpoint:** `GET /megamillion_ticket/:id`

**Authentication:** Required (Bearer Token)

**Authorization:** 
- Users can only view their own tickets
- Admins can view any ticket

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | Number | Yes | The unique ticket ID |

**Request Headers:**
```
Authorization: Bearer <token>
X-API-Key: <api-key>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "ticket": {
    "id": "67890",
    "user": {
      "id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "USER"
    },
    "lottery": {
      "id": "lottery789",
      "name": "Megamillion Weekly Draw",
      "state": {
        "id": "state456",
        "name": "California",
        "code": "CA"
      },
      "drawTime": "2025-10-15T20:00:00.000Z",
      "status": "COMPLETED",
      "result": {
        "mainNumbers": [5, 12, 23, 34, 45],
        "megaBall": 7
      }
    },
    "mainNumbers": [5, 12, 23, 34, 46],
    "megaBall": 7,
    "multiplier": 2,
    "totalAmount": 20,
    "totalAmountWon": 40,
    "cashType": "REAL",
    "status": "WON",
    "matchedNumbers": 4,
    "matchedMegaBall": true,
    "createdAt": "2025-10-15T19:30:00.000Z",
    "updatedAt": "2025-10-15T20:05:00.000Z"
  }
}
```

**Error Responses:**

*400 Bad Request:*
```json
{
  "success": false,
  "error": "Invalid ticket ID. ID must be numeric."
}
```

*404 Not Found:*
```json
{
  "success": false,
  "error": "Ticket not found or access denied."
}
```

*409 Conflict:*
```json
{
  "success": false,
  "error": "Database error message"
}
```

---

## 3. Roulette Ticket Details

### Get Roulette Ticket by Ticket ID

Retrieves detailed information about a specific Roulette ticket using the ticket ID.

**Endpoint:** `GET /roulette_ticket/ticket/:id`

**Authentication:** Required (Bearer Token)

**Authorization:** 
- Users can only view their own tickets
- Admins can view any ticket

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | String | Yes | The unique ticket ID (MongoDB ObjectId) |

**Request Headers:**
```
Authorization: Bearer <token>
X-API-Key: <api-key>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "ticket": {
    "id": "507f1f77bcf86cd799439011",
    "user": {
      "id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "USER"
    },
    "roulette": {
      "id": "507f1f77bcf86cd799439022",
      "name": "Roulette Game #1234",
      "status": "COMPLETED",
      "result": "red-17",
      "createdAt": "2025-10-15T19:00:00.000Z",
      "updatedAt": "2025-10-15T19:05:00.000Z"
    },
    "bet": [
      {
        "blockPlayed": "red",
        "amountPlayed": 50,
        "amountWon": 100
      },
      {
        "blockPlayed": "17",
        "amountPlayed": 10,
        "amountWon": 360
      }
    ],
    "cashType": "REAL",
    "totalAmountPlayed": 60,
    "totalAmountWon": 460,
    "createdAt": "2025-10-15T18:55:00.000Z",
    "updatedAt": "2025-10-15T19:05:00.000Z"
  }
}
```

**Error Responses:**

*400 Bad Request:*
```json
{
  "success": false,
  "error": "Ticket ID is required."
}
```

*404 Not Found:*
```json
{
  "success": false,
  "error": "Ticket not found or access denied."
}
```

*500 Internal Server Error:*
```json
{
  "success": false,
  "error": "Failed to fetch ticket details"
}
```

---

### Get Roulette Ticket by Game ID (Alternative)

Retrieves a user's ticket for a specific roulette game using the roulette game ID.

**Endpoint:** `GET /roulette_ticket/:id`

**Authentication:** Required (Bearer Token)

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | String | Yes | The roulette game ID |

**Request Headers:**
```
Authorization: Bearer <token>
X-API-Key: <api-key>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "rouletteTicket": {
    "id": "507f1f77bcf86cd799439011",
    "user": "user123",
    "roulette": "507f1f77bcf86cd799439022",
    "bet": [
      {
        "blockPlayed": "red",
        "amountPlayed": 50,
        "amountWon": 100
      }
    ],
    "cashType": "REAL",
    "totalAmountPlayed": 50,
    "totalAmountWon": 100,
    "createdAt": "2025-10-15T18:55:00.000Z",
    "updatedAt": "2025-10-15T19:05:00.000Z"
  }
}
```

**Error Responses:**

*404 Not Found:*
```json
{
  "success": false,
  "error": "Ticket not found for this roulette game."
}
```

---

## 4. Domino Game Details

### Get Domino Game by Game ID

Retrieves comprehensive information about a specific Domino game including board state, players, moves, and results.

**Endpoint:** `GET /domino/game/:id`

**Authentication:** Required (Bearer Token)

**Authorization:** 
- Users can only view games they participated in
- Admins can view any game

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | String | Yes | The unique game ID (MongoDB ObjectId) |

**Request Headers:**
```
Authorization: Bearer <token>
X-API-Key: <api-key>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "507f1f77bcf86cd799439033",
    "roomId": "ROOM-1234-ABCD",
    "roomType": "PUBLIC",
    "playerCount": 4,
    "gameNumber": 1,
    "gameState": "COMPLETED",
    "currentPlayer": 2,
    "entryFee": 10,
    "cashType": "REAL",
    "totalPot": 40,
    "houseEdge": 5,
    "houseAmount": 2,
    "winnerPayout": 38,
    "winner": 2,
    "endReason": "LAST_TILE",
    "duration": 420,
    "totalMoves": 28,
    "turnTimeLimit": 15,
    "turnStartTime": "2025-10-15T20:00:00.000Z",
    "board": [
      {
        "tile": "6-6",
        "position": 0,
        "placedBy": 0,
        "hasRotation": false,
        "side": "LEFT",
        "placedAt": "2025-10-15T19:53:00.000Z"
      },
      {
        "tile": "6-4",
        "position": 1,
        "placedBy": 1,
        "hasRotation": false,
        "side": "RIGHT",
        "placedAt": "2025-10-15T19:53:15.000Z"
      }
    ],
    "players": [
      {
        "position": 0,
        "user": {
          "id": "user123",
          "name": "John Doe"
        },
        "playerType": "HUMAN",
        "playerName": "John Doe",
        "handCount": 0,
        "hand": ["2-3", "1-5"],
        "score": 8,
        "totalScore": 8,
        "isConnected": true,
        "lastAction": "2025-10-15T19:59:45.000Z",
        "consecutivePasses": 0
      },
      {
        "position": 1,
        "user": {
          "id": "user456",
          "name": "Jane Smith"
        },
        "playerType": "HUMAN",
        "playerName": "Jane Smith",
        "handCount": 0,
        "score": 0,
        "totalScore": 0,
        "isConnected": true,
        "lastAction": "2025-10-15T20:00:00.000Z",
        "consecutivePasses": 0
      },
      {
        "position": 2,
        "user": null,
        "playerType": "COMPUTER",
        "playerName": "Bot_Alpha",
        "handCount": 3,
        "score": 5,
        "totalScore": 5,
        "isConnected": true,
        "lastAction": "2025-10-15T19:59:55.000Z",
        "consecutivePasses": 0
      },
      {
        "position": 3,
        "user": null,
        "playerType": "COMPUTER",
        "playerName": "Bot_Beta",
        "handCount": 2,
        "score": 3,
        "totalScore": 3,
        "isConnected": true,
        "lastAction": "2025-10-15T19:59:50.000Z",
        "consecutivePasses": 0
      }
    ],
    "moves": [
      {
        "player": 0,
        "action": "PLACE",
        "tile": "6-6",
        "fromHand": true,
        "boardState": "6-6",
        "timestamp": "2025-10-15T19:53:00.000Z",
        "isAutoMove": false
      },
      {
        "player": 1,
        "action": "PLACE",
        "tile": "6-4",
        "fromHand": true,
        "boardState": "6-6|6-4",
        "timestamp": "2025-10-15T19:53:15.000Z",
        "isAutoMove": false
      }
    ],
    "turnHistory": [
      {
        "player": 0,
        "startTime": "2025-10-15T19:52:45.000Z",
        "endTime": "2025-10-15T19:53:00.000Z",
        "timeUsed": 15
      }
    ],
    "finalScores": [
      {
        "position": 0,
        "dotsRemaining": 8,
        "tilesRemaining": 2,
        "roundScore": 8,
        "totalScore": 8
      },
      {
        "position": 1,
        "dotsRemaining": 0,
        "tilesRemaining": 0,
        "roundScore": 0,
        "totalScore": 0
      },
      {
        "position": 2,
        "dotsRemaining": 5,
        "tilesRemaining": 3,
        "roundScore": 5,
        "totalScore": 5
      },
      {
        "position": 3,
        "dotsRemaining": 3,
        "tilesRemaining": 2,
        "roundScore": 3,
        "totalScore": 3
      }
    ],
    "myPosition": 0,
    "myScore": 8,
    "myTotalScore": 8,
    "myHand": ["2-3", "1-5"],
    "isWinner": false,
    "payout": 0,
    "createdAt": "2025-10-15T19:52:40.000Z",
    "updatedAt": "2025-10-15T20:00:05.000Z"
  }
}
```

**Response Fields Explanation:**

| Field | Description |
|-------|-------------|
| `id` | Unique game identifier |
| `roomId` | The room identifier where the game was played |
| `roomType` | Type of room (PUBLIC or PRIVATE) |
| `gameState` | Current state: ACTIVE, COMPLETED, BLOCKED, CANCELLED |
| `currentPlayer` | Position of the player whose turn it is |
| `board` | Array of tiles placed on the board in order |
| `players` | Array of player information |
| `players[].hand` | Only visible for requesting user or if game is COMPLETED |
| `players[].handCount` | Number of tiles in player's hand |
| `moves` | Complete history of all moves in the game |
| `turnHistory` | Timing information for each turn |
| `finalScores` | Final scoring information for all players |
| `myPosition` | The requesting user's position in the game |
| `myHand` | The requesting user's current hand |
| `isWinner` | Whether the requesting user won the game |
| `payout` | Amount won by the requesting user (0 if not winner) |

**Error Responses:**

*400 Bad Request:*
```json
{
  "success": false,
  "error": "Game ID is required."
}
```

*403 Forbidden:*
```json
{
  "success": false,
  "error": "Access denied. You are not a player in this game."
}
```

*404 Not Found:*
```json
{
  "success": false,
  "error": "Game not found."
}
```

*500 Internal Server Error:*
```json
{
  "success": false,
  "error": "Failed to fetch game details"
}
```

---

## Common Response Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request completed successfully |
| 400 | Bad Request - Invalid parameters or validation error |
| 401 | Unauthorized - Missing or invalid authentication token |
| 403 | Forbidden - User doesn't have permission to access resource |
| 404 | Not Found - Requested resource doesn't exist or access denied |
| 409 | Conflict - Database or business logic error |
| 500 | Internal Server Error - Unexpected server error |

---

## Authentication

All endpoints require authentication using Bearer token in the Authorization header and API key in X-API-Key header.

**Example:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-API-Key: your-api-key-here
```

---

## Notes

1. **Timestamps**: All timestamp fields are in ISO 8601 format (UTC)
2. **IDs**: Most IDs are MongoDB ObjectIds (24-character hex strings), except Borlette and Megamillion ticket IDs which are numeric
3. **Cash Types**: Can be either "REAL" or "VIRTUAL"
4. **Permissions**: Regular users can only access their own tickets/games, while ADMIN role can access any resource
5. **Privacy**: In active Domino games, other players' hands are hidden; only visible to the owner or after game completion
6. **Pagination**: For listing endpoints (not covered here), use `offset` and `limit` query parameters

---

## Support

For questions or issues with these APIs, please contact the backend development team.

**Last Updated:** October 15, 2025

