# Global Chat Management (Admin)

Administrative REST interface for moderating the public lobby chat. All routes are mounted under `/api/admin/global-chat-management`, require the standard `x-api-key` header (`xApi()` middleware) and a JWT belonging to a user with the `ADMIN` role (`token({ roles: ['ADMIN'] })`).

---

## Endpoints Overview

| Method & Path | Description |
| --- | --- |
| `GET /messages` | Paginated list of global chat messages with moderation filters |
| `DELETE /messages/:messageId` | Soft delete a message and mark the responsible admin |
| `POST /mutes` | Mute a user (optional expiration and reason) |
| `DELETE /mutes/:userId` | Remove the active mute for a user |
| `GET /status` | Retrieve current chat availability state |
| `PATCH /status` | Enable or disable the lobby chat |

---

## `GET /messages`

Return chat history for moderation purposes. Supports advanced filtering and includes deleted items when requested.

### Query Parameters

| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | number | 50 | 1–200 items per page |
| `offset` | number | 0 | Zero-based offset |
| `sortBy` | string | `createdAt` | Any indexed message field |
| `sortOrder` | string | `desc` | `asc` or `desc` (case-insensitive) |
| `includeDeleted` | boolean | `false` | When `true`, deleted records are included |
| `userId` | string | — | Filter by author ID |
| `messageType` | string | — | `TEXT`, `IMAGE`, `AUDIO`, or `VIDEO` |
| `search` | string | — | Case-insensitive partial match on `message` |
| `startDate` | string | — | ISO timestamp; inclusive lower bound |
| `endDate` | string | — | ISO timestamp; inclusive upper bound |

### Success Response

```json
{
  "success": true,
  "messages": [
    {
      "id": "673a3f...",
      "user": {
        "id": "64fe0a...",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "userName": "jane_d"
      },
      "userName": "jane_d",
      "message": "Hello world",
      "messageType": "TEXT",
      "isDeleted": false,
      "createdAt": "2025-11-08T12:10:00.000Z",
      "updatedAt": "2025-11-08T12:10:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 320,
    "hasMore": true
  }
}
```

---

## `DELETE /messages/:messageId`

Soft delete a chat message. The document remains in the collection with `isDeleted = true`, `deletedBy`, and `deletedAt` metadata.

### Path Parameters

| Name | Type | Notes |
| --- | --- | --- |
| `messageId` | string | Mongo `_id` of the message |

### Success Response

```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

---

## `POST /mutes`

Create an active mute for a user.

### Request Body

```json
{
  "userId": "64fe0a...",
  "reason": "Spam links in chat",
  "expiresAt": "2025-11-15T00:00:00.000Z"
}
```

- `userId` (required): target user.
- `reason` (optional): free-form text.
- `expiresAt` (optional): ISO timestamp; omit for indefinite mute.

### Success Response

```json
{
  "success": true,
  "message": "User muted successfully",
  "mute": {
    "user": "64fe0a...",
    "mutedBy": "643b42...",
    "reason": "Spam links in chat",
    "expiresAt": "2025-11-15T00:00:00.000Z",
    "isActive": true,
    "createdAt": "2025-11-08T12:15:00.000Z"
  }
}
```

If the user is already muted, a `409` response is returned from the underlying global chat controller.

---

## `DELETE /mutes/:userId`

Deactivate the active mute for the given user.

### Path Parameters

| Name | Type | Notes |
| --- | --- | --- |
| `userId` | string | Target user ID |

### Success Response

```json
{
  "success": true,
  "message": "User unmuted successfully"
}
```

- Returns `404` if the user has no active mute.

---

## `GET /status`

Retrieve the current lobby chat availability state.

### Success Response

```json
{
  "success": true,
  "status": {
    "isDisabled": false,
    "disabledReason": null,
    "disabledBy": null,
    "disabledAt": null,
    "updatedAt": "2025-11-08T12:00:00.000Z",
    "createdAt": "2025-09-01T00:00:00.000Z"
  }
}
```

---

## `PATCH /status`

Enable or disable the lobby chat experience. When disabled, socket clients are prevented from sending new messages and receive a `chat-status-changed` broadcast.

### Request Body

```json
{
  "isDisabled": true,
  "reason": "Scheduled maintenance"
}
```

- `isDisabled` (required boolean): `true` to disable chat, `false` to re-enable.
- `reason` (optional string): stored and surfaced to clients when present.

### Success Response

```json
{
  "success": true,
  "message": "Global chat disabled successfully",
  "status": {
    "isDisabled": true,
    "disabledReason": "Scheduled maintenance",
    "disabledBy": "643b42...",
    "disabledAt": "2025-11-08T12:20:00.000Z",
    "updatedAt": "2025-11-08T12:20:00.000Z",
    "createdAt": "2025-09-01T00:00:00.000Z"
  }
}
```

When re-enabled (`isDisabled: false`), the response mirrors the above with nullified disable metadata.

---

## Socket Broadcasts

Whenever the chat status changes, a `chat-status-changed` event is sent to all connected lobby clients with the same payload as `GET /status`. This enables real-time UI updates without polling.


