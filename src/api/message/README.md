# Message API

User-facing endpoints for creating and managing support messages inside FlippX services.

## Authentication

All routes require:
- `x-api-key` header (handled by `xApi()` middleware)
- Bearer token (handled by `token({ required: true })`)

## Base Path

```
/messages
```

## POST `/`

Create a new message.

### Request Body

```json
{
  "title": "string (required)",
  "message": "string (required)",
  "media": ["https://example.com/image.png"]
}
```

- `message` and `body` are aliases; either may be supplied.
- `media` is optional. Values must be valid URL strings.

### Response `201`

```json
{
  "success": true,
  "message": {
    "id": "65f1f1e7b8e6b529af5a1c01",
    "title": "Withdrawal issue",
    "body": "I am unable to withdraw funds.",
    "media": [],
    "status": "OPEN",
    "replies": [],
    "createdAt": "2025-03-04T10:25:30.100Z",
    "updatedAt": "2025-03-04T10:25:30.100Z",
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

- `400` – Missing `title` or body, invalid media list.
- `401` – Authentication required.
- `500` – Unexpected server error.

## GET `/`

List messages created by the authenticated user.

### Query Parameters

| Name       | Type   | Default | Description                                     |
|------------|--------|---------|-------------------------------------------------|
| `offset`   | number | `0`     | Items to skip                                   |
| `limit`    | number | `10`    | Items to return                                 |
| `sortBy`   | string | `createdAt` | Field to sort by                           |
| `sortOrder`| string | `desc`  | `asc` or `desc`                                 |
| `status`   | string | —       | Filter by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) |

### Response `200`

```json
{
  "success": true,
  "messages": [
    {
      "id": "65f1f1e7b8e6b529af5a1c01",
      "title": "Withdrawal issue",
      "status": "OPEN",
      "createdAt": "2025-03-04T10:25:30.100Z",
      "updatedAt": "2025-03-04T10:25:30.100Z",
      "media": [],
      "replies": [],
      "lastRepliedAt": null
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 10,
    "offset": 0,
    "hasMore": false
  }
}
```

### Possible Errors

- `400` – Invalid status filter.
- `401` – Authentication required.
- `500` – Unexpected server error.

## GET `/:messageId`

Fetch full details for a specific message created by the authenticated user.

### Response `200`

```json
{
  "success": true,
  "message": {
    "id": "65f1f1e7b8e6b529af5a1c01",
    "title": "Withdrawal issue",
    "body": "I am unable to withdraw funds.",
    "media": [],
    "status": "OPEN",
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
      "phone": "+5095551234"
    }
  }
}
```

### Possible Errors

- `400` – Invalid `messageId`.
- `401` – Authentication required.
- `404` – Message not found or not owned by user.
- `500` – Unexpected server error.

