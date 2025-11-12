# Domino Management (Admin)

Admin-focused service that provides insights into domino games and tools to manage domino room pricing. All endpoints require `ADMIN` role unless explicitly noted.

## Endpoints

### List Domino Games

- **Route:** `GET /api/admin/domino-management/games`
- **Description:** Returns paginated list of domino games with room metadata and statistics.
- **Query Parameters:**
	- `page` *(number, default: 1)*
	- `limit` *(number, default: 20, max: 100)*
	- `gameState` *(ACTIVE | COMPLETED | BLOCKED | CANCELLED)*
	- `winRule` *(STANDARD | POINTS)*
	- `roomType` *(PUBLIC | PRIVATE)*
	- `cashType` *(REAL | VIRTUAL)*
	- `playerCount` *(2 | 3 | 4)*
	- `opponentType` *(HUMAN | AI)*
	- `roomStatus` *(WAITING | IN_PROGRESS | COMPLETED | CANCELLED)*
	- `entryFee`, `minEntryFee`, `maxEntryFee` *(number)*
	- `targetPoints` *(number)*
	- `startDate`, `endDate` *(timestamp or ISO string)*
	- `search` *(matches roomId, player name, entry fee, or ids)*
	- `sortBy` *(createdAt | updatedAt | completedAt | totalMoves | duration | entryFee | totalPot)*
	- `sortOrder` *(asc | desc, default: desc)*

### Get Domino Game Details

- **Route:** `GET /api/admin/domino-management/games/:gameId`
- **Description:** Fetches full game breakdown (moves, scoring, player summary, rewards) for standard and point-based domino games.

### List Domino Room Prices

- **Route:** `GET /api/admin/domino-management/room-prices`
- **Description:** Paginated list of room pricing rules with author metadata.
- **Query Parameters:** `page`, `limit`, `winRule`, `roomType`, `cashType`, `playerCount`, `targetPoints`, `isActive`, `sortBy`, `sortOrder`.

### Create Domino Room Price

- **Route:** `POST /api/admin/domino-management/room-prices`
- **Body:**
	```json
	{
		"winRule": "STANDARD",
		"roomType": "PUBLIC",
		"playerCount": 4,
		"cashType": "REAL",
		"entryFee": 20,
		"houseEdge": 5,
		"targetPoints": 100,
		"isActive": true,
		"displayOrder": 10
	}
	```
- **Notes:**
	- `targetPoints` is required when `winRule` is `POINTS`.
	- Automatically syncs allowed entry fee list in `DominoGameConfig`.

### Update Domino Room Price

- **Route:** `PUT /api/admin/domino-management/room-prices/:priceId`
- **Description:** Partial update. Same validation as creation. Adjusts config entry fee list on success.

### Delete Domino Room Price

- **Route:** `DELETE /api/admin/domino-management/room-prices/:priceId`
- **Description:** Removes pricing rule and refreshes entry fee config.

## Room Price Sync

Whenever room prices are created, updated, or deleted, the service recalculates the unique list of active entry fees and stores it in `DominoGameConfig.entryFees`. This keeps game validation aligned with the configured prices.

