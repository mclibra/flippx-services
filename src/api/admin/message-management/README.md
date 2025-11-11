# Admin Message Management API

Administrative endpoints for reviewing and responding to user-submitted messages.

## Authentication

All routes require:
- `x-api-key` header (handled by `xApi()` middleware)
- Bearer token with `ADMIN` role (`token({ required: true, roles: ['ADMIN'] })`)

## Base Path

```
/admin/message-management
```

## GET `/messages`

Retrieve a paginated list of messages. Supports filtering by status, user, date range, and text search.

### Query Parameters

| Name       | Type   | Description |
|------------|--------|-------------|
| `offset`   | number | Items to skip (default `0`) |
| `limit`    | number | Items to return (default `10`) |
| `sortBy`   | string | Field to sort by (default `createdAt`) |
| `sortOrder`| string | `asc` or `desc` (default `desc`) |
| `status`   | string | Filter by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) |
| `userId`   | string | Filter by user id (MongoDB ObjectId) |
| `fromDate` | string | ISO date string; includes messages created on/after this date |
| `toDate`   | string | ISO date string; includes messages created on/before this date |
| `search`   | string | Case-insensitive search across `title` and `body` |

### Response `200`

```json
{
  "success": true,
  "messages": [
    {
      "id": "65f1f1e7b8e6b529af5a1c01",
      "title": "Withdrawal issue",
      "body": "I am unable to withdraw funds.",
      "media": [],
      "status": "IN_PROGRESS",
      "replies": [],
      "createdAt": "2025-03-04T10:25:30.100Z",
      "updatedAt": "2025-03-04T10:25:30.100Z",
      "lastRepliedAt": null,
      "user": {
        "id": "64f1f0e7b8e6b529af5a1bf9",
        "name": {
          "firstName": "Jane",
          "lastName": "Doe"
        },
        "email": "jane@example.com",
        "phone": "+5095551234"
      }
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

### Possible Errors

- `400` – Invalid filter (status, userId, fromDate, toDate).
- `401` – Authentication required.
- `403` – Insufficient permissions.
- `500` – Unexpected server error.

## GET `/messages/:messageId`

Get detailed information about a specific message, including replies.

### Response `200`

```json
{
  "success": true,
  "message": {
    "id": "65f1f1e7b8e6b529af5a1c01",
    "title": "Withdrawal issue",
    "body": "I am unable to withdraw funds.",
    "media": [],
    "status": "IN_PROGRESS",
    "replies": [
      {
        "id": "65f1f4b7f8e6b529af5a1c20",
        "body": "We are looking into this.",
        "media": [],
        "repliedBy": {
          "id": "64f1efc7b8e6b529af5a1bf1",
          "name": {
            "firstName": "Admin",
            "lastName": "User"
          },
          "email": "support@example.com",
          "role": "ADMIN"
        },
        "createdAt": "2025-03-04T11:00:30.100Z"
      }
    ],
    "createdAt": "2025-03-04T10:25:30.100Z",
    "updatedAt": "2025-03-04T11:00:30.100Z",
    "lastRepliedAt": "2025-03-04T11:00:30.100Z",
    "user": {
      "id": "64f1f0e7b8e6b529af5a1bf9",
      "name": {
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "email": "jane@example.com",
      "phone": "+5095551234",
      "role": "USER"
    }
  }
}
```

### Possible Errors

- `400` – Invalid `messageId`.
- `401` – Authentication required.
- `403` – Insufficient permissions.
- `404` – Message not found.
- `500` – Unexpected server error.

## PATCH `/messages/:messageId/status`

Update the status of a message without adding a reply.

### Request Body

```json
{
  "status": "RESOLVED"
}
```

Allowed values: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.

### Response `200`

```json
{
  "success": true,
  "message": {
    "id": "65f1f1e7b8e6b529af5a1c01",
    "status": "RESOLVED",
    "title": "Withdrawal issue",
    "body": "I am unable to withdraw funds.",
    "media": [],
    "replies": [],
    "createdAt": "2025-03-04T10:25:30.100Z",
    "updatedAt": "2025-03-04T12:15:30.100Z",
    "lastRepliedAt": null,
    "user": {
      "id": "64f1f0e7b8e6b529af5a1bf9",
      "name": {
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "email": "jane@example.com",
      "phone": "+5095551234"
    }
  }
}
```

### Possible Errors

- `400` – Invalid `messageId` or status payload.
- `401` / `403` – Authentication or authorization failure.
- `404` – Message not found.
- `500` – Unexpected server error.

## POST `/messages/:messageId/replies`

Add a reply to the message. Status may be updated in the same call.

### Request Body

```json
{
  "reply": "We have reset your withdrawal limit.",
  "media": [
    "https://example.com/notes.pdf"
  ],
  "status": "IN_PROGRESS"
}
```

- `reply` (string) is required.
- `media` is optional; values must be valid URL strings.
- `status` is optional. If omitted, the service moves the message to `IN_PROGRESS`.

### Response `200`

```json
{
  "success": true,
  "message": {
    "id": "65f1f1e7b8e6b529af5a1c01",
    "status": "IN_PROGRESS",
    "replies": [
      {
        "id": "65f1f4b7f8e6b529af5a1c20",
        "body": "We have reset your withdrawal limit.",
        "media": [
          "https://example.com/notes.pdf"
        ],
        "repliedBy": {
          "id": "64f1efc7b8e6b529af5a1bf1",
          "name": {
            "firstName": "Admin",
            "lastName": "User"
          },
          "email": "support@example.com",
          "role": "ADMIN"
        },
        "createdAt": "2025-03-04T11:00:30.100Z"
      }
    ],
    "lastRepliedAt": "2025-03-04T11:00:30.100Z",
    "updatedAt": "2025-03-04T11:00:30.100Z",
    "user": {
      "id": "64f1f0e7b8e6b529af5a1bf9",
      "name": {
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "email": "jane@example.com",
      "phone": "+5095551234"
    }
  }
}
```

### Possible Errors

- `400` – Invalid `messageId`, missing reply body, or invalid status.
- `401` / `403` – Authentication or authorization failure.
- `404` – Message not found.
- `500` – Unexpected server error.

