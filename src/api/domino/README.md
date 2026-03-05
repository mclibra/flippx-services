# Domino API

Domino gameplay, chat, and configuration endpoints for FlippX services.

## Authentication

All routes require the `x-api-key` header (`xApi()` middleware).  
Unless otherwise noted, they also require a bearer token (`token({ required: true })`).

## Base Path

```
/domino
```

---

## POST `/rooms/:roomId/chat`

Send a chat message to an active domino room.

### Request Params

- `roomId` *(string, required)* – Public room identifier (e.g. `DOMINO-1234`)

### Request Body

```json
{
  "message": "string (required)",
  "messageType": "TEXT | EMOJI | SYSTEM | GAME_ACTION",
  "playerName": "string"
}
```

`messageType` defaults to `TEXT`. `playerName` overrides the stored player label when present.

### Response `200`

```json
{
  "success": true,
  "message": {
    "id": "65c2a6f4f2d92d0012f3c9ab",
    "room": "65bff9063a9d4f001268d77f",
    "playerName": "DominoMaster",
    "message": "Good luck!",
    "messageType": "TEXT",
    "createdAt": "2025-02-18T21:15:30.123Z"
  }
}
```

### Possible Errors

- `400` – Missing or invalid message payload.
- `404` – Room not found or chat disabled.
- `500` – Unexpected server error.

---

## GET `/rooms/:roomId/chat`

Fetch paginated chat history for a domino room.

### Query Parameters

| Name     | Type   | Default | Description                      |
|----------|--------|---------|----------------------------------|
| `limit`  | number | `50`    | Page size (1–200)                |
| `offset` | number | `0`     | Items to skip (for pagination)   |

### Response `200`

```json
{
  "success": true,
  "messages": [
    {
      "id": "65c2a6f4f2d92d0012f3c9ab",
      "playerName": "DominoMaster",
      "message": "Good luck!",
      "messageType": "TEXT",
      "createdAt": "2025-02-18T21:15:30.123Z"
    }
  ],
  "total": 194,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## GET `/room-prices`

List domino room pricing definitions that clients can use to identify available stakes.

### Query Parameters

All filters are optional. When omitted, only active prices are returned.

| Name              | Type    | Description                                     |
|-------------------|---------|-------------------------------------------------|
| `winRule`         | string  | `STANDARD` or `POINTS`                          |
| `roomType`        | string  | `PUBLIC` or `PRIVATE`                           |
| `playerCount`     | number  | 2, 3, or 4                                      |
| `cashType`        | string  | `REAL` or `VIRTUAL`                             |
| `targetPoints`    | number  | Match specific point goal (only for POINTS rule)|
| `includeInactive` | boolean | Include inactive prices when `true`             |

### Response `200`

```json
{
  "success": true,
  "prices": [
    {
      "_id": "65d0b7735d6a0b0022c1f596",
      "winRule": "STANDARD",
      "roomType": "PUBLIC",
      "playerCount": 4,
      "cashType": "REAL",
      "entryFee": 20,
      "houseEdge": 5,
      "targetPoints": 0,
      "isActive": true,
      "displayOrder": 10
    }
  ]
}
```

---

## PUT `/config` *(ADMIN)*

Update global domino configuration (turn timers, allowed entry fees, etc.).

### Request Body

Partial updates are allowed. For example:

```json
{
  "entryFees": [5, 10, 25, 50],
  "turnTimeLimit": 20,
  "isActive": true
}
```

### Response `200`

```json
{
  "success": true,
  "config": {
    "entryFees": [5, 10, 25, 50],
    "turnTimeLimit": 20,
    "isActive": true,
    "updatedAt": "2025-02-20T10:05:00.000Z"
  }
}
```

---

## GET `/config` *(ADMIN)*

Fetch the current domino configuration document.

### Response `200`

```json
{
  "success": true,
  "config": {
    "entryFees": [5, 10, 20, 30, 50, 100],
    "maxPlayersPerRoom": 4,
    "turnTimeLimit": 15,
    "houseEdge": 0,
    "isActive": true
  }
}
```

---

## GET `/user/games`

Retrieve completed domino games for the authenticated player.

### Response `200`

```json
{
  "success": true,
  "games": [
    {
      "id": "65cd01de4b0ff00012f3d831",
      "roomId": "DOMINO-1234",
      "winRule": "STANDARD",
      "entryFee": 20,
      "result": "WON",
      "totalScore": 45,
      "completedAt": "2025-02-25T18:05:12.903Z"
    }
  ]
}
```

---

## GET `/game/:id`

Fetch full details for a specific domino match joined by the authenticated player.

### Response `200`

```json
{
  "success": true,
  "game": {
    "id": "65cd01de4b0ff00012f3d831",
    "roomId": "DOMINO-1234",
    "winRule": "POINTS",
    "targetPoints": 100,
    "players": [
      { "position": 0, "playerName": "Alice", "score": 100 },
      { "position": 1, "playerName": "Bob",   "score": 74  }
    ],
    "moves": [
      { "player": 0, "action": "PLACE", "tile": "6-6" }
    ],
    "statistics": {
      "totalMoves": 42,
      "duration": 895,
      "houseEdge": 5,
      "totalPot": 80
    }
  }
}
```

---

## Notes

- Domino room pricing exposed here aligns with the admin-managed catalog (`/api/admin/domino-management/room-prices`).
- Entry fee validation uses the `DominoGameConfig.entryFees` list. When admins add or remove active room prices, the config is automatically synced.  
- Socket-based gameplay (`dominoGameSocket`) reuses the same configuration and room identifiers documented above.

