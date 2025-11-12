# Invite Service

APIs that let authenticated players send SMS invitations to friends and monitor delivery status. Invites are throttled per recipient and persist delivery outcomes for auditing and retries.

---

## Quick Reference

| Area | What’s Covered |
| --- | --- |
| [Key Concepts](#key-concepts) | Invite lifecycle and storage |
| [Data Model](#data-model) | Mongo document structure |
| [REST APIs](#rest-apis) | Contract details and samples |
| [Usage Examples](#usage-examples) | Typical flows and error handling |
| [Testing Checklist](#testing-checklist) | Manual validation steps |

---

## Key Concepts

- **Invite Message** – Text body delivered to every recipient in the request. Defaults to the configured template when omitted.
- **Per-Recipient State** – Each phone number is tracked with last attempt time, current status, and failure reason.
- **Idempotency** – Re-inviting the same phone overwrites pending data but keeps history fields (timestamps) updated.
- **Delivery Backend** – Uses AWS Pinpoint SMS Voice V2 when `ENABLE_TEXT=true`; otherwise runs in dry mode and marks invites as sent without hitting AWS.

---

## Data Model

### Invite

| Field | Type | Notes |
| --- | --- | --- |
| `invitedBy` | `ObjectId` (ref `User`) | Sender; required, indexed |
| `phone` | `String` | Normalized input phone; unique with `invitedBy` |
| `message` | `String` | Final text delivered to the recipient |
| `status` | `Enum('PENDING','SENT','FAILED')` | Updated per delivery attempt |
| `error` | `String` | Last failure message (nullable) |
| `sentAt` | `Date` | Timestamp when the SMS succeeded |
| `lastAttemptAt` | `Date` | Timestamp for the latest send attempt |
| `createdAt/updatedAt` | `Date` | Managed by Mongoose |

Unique Index: `{ invitedBy: 1, phone: 1 }`

---

## REST APIs

Routes mount under `/api/invite` and require:

- `x-api-key` header (`xApi()` middleware)
- Valid user JWT (`token({ required: true })`)

### Summary

| Method & Path | Auth | Description |
| --- | --- | --- |
| `POST /` | User | Send SMS invites to one or more phone numbers |
| `POST /status` | User | Fetch invite statuses for specific phone numbers |

---

### `POST /api/invite/`

Send invitation messages to multiple recipients. Each phone is processed independently; failures do not halt the request.

**Request Body**
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phoneNumbers` | `string[]` | Yes | Array of phone numbers; duplicates/empties are ignored |
| `message` | `string` | No | Custom message; trimmed. Falls back to config default when omitted |

**Success Response (`200`)**
```json
{
  "success": true,
  "invites": [
    {
      "phone": "+15551234567",
      "status": "SENT",
      "sentAt": "2025-11-12T14:07:22.931Z"
    },
    {
      "phone": "+15557654321",
      "status": "FAILED",
      "error": "Recipient opted out"
    }
  ]
}
```

**Client Errors**

| Status | When |
| --- | --- |
| `400` | Missing/invalid `phoneNumbers`, or resolved message is empty |
| `401` | Missing/invalid auth token |

**Server Errors**

| Status | When |
| --- | --- |
| `500` | Unhandled errors (database, AWS, config issues) |

---

### `POST /api/invite/status`

Retrieve the latest invitation state for a list of phone numbers.

**Request Body**
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phoneNumbers` | `string[]` | Yes | Normalized before lookup; duplicates are collapsed |

**Success Response (`200`)**
```json
{
  "success": true,
  "invites": [
    {
      "phone": "+15551234567",
      "status": "SENT",
      "sentAt": "2025-11-12T14:07:22.931Z",
      "lastAttemptAt": "2025-11-12T14:07:22.931Z"
    },
    {
      "phone": "+15557654321",
      "status": "FAILED",
      "lastAttemptAt": "2025-11-12T14:07:22.931Z",
      "error": "Recipient opted out"
    },
    {
      "phone": "+15559876543",
      "status": "NOT_FOUND"
    }
  ]
}
```

Entries missing in the database return `status: "NOT_FOUND"`.

**Client Errors**

| Status | When |
| --- | --- |
| `400` | Phone number list missing or empty after sanitization |
| `401` | Authentication failure |

**Server Errors**

| Status | When |
| --- | --- |
| `500` | Unexpected backend errors |

---

## Usage Examples

```bash
curl -X POST https://api.flippx.com/api/invite \
  -H 'x-api-key: <API_KEY>' \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumbers": ["+15551234567", "+15557654321"],
    "message": "FlippX is awesome—join my table tonight!"
  }'
```

```bash
curl -X POST https://api.flippx.com/api/invite/status \
  -H 'x-api-key: <API_KEY>' \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumbers": ["+15551234567", "+15557654321", "+15559876543"]
  }'
```

---

## Testing Checklist

- Send invites with and without custom messages.
- Verify dry-run behavior when `ENABLE_TEXT=false`.
- Attempt resending to the same phone and confirm timestamps update.
- Inspect error reporting by forcing AWS failures (e.g., invalid origination number).
- Fetch status for mixed known/unknown numbers and confirm `NOT_FOUND` entries.


