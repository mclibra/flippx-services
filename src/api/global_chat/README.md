# Global Chat Service

REST and socket interfaces that power the public lobby chat in FlippX. This document explains how messages move through the system, which APIs are available, and how moderation features operate.

---

## Quick Reference

| Area | What’s Covered |
| --- | --- |
| [Key Concepts](#key-concepts) | Core data entities and how they relate |
| [Data Models](#data-models) | Mongo collections with important fields |
| [REST APIs](#rest-apis) | Request/response contracts and examples |
| [Socket Events](#socket-events) | Client/server events with payload samples |
| [Moderation Flows](#moderation-flows) | How reporting, hiding, and muting work |
| [Usage Examples](#usage-examples) | End-to-end snippets for common actions |
| [Testing Checklist](#testing-checklist) | Manual validation steps |

---

## Key Concepts

- **Public Lobby** – shared channel where every connected player sees the same stream, except for messages they personally report.
- **Message Visibility** – messages are soft deleted globally for admin removals and locally hidden when a user reports them.
- **Moderation Roles** – admins can mute users and delete messages; end users can report content or other participants.
- **Transport** – Socket.io drives real-time updates; Express routes expose history, status, and moderation operations.

---

## Data Models

### GlobalChatMessage
| Field | Type | Notes |
| --- | --- | --- |
| `user` | `String` (ref `User`) | Author ID |
| `userName` | `String` | Stored for quick rendering |
| `message` | `String` | Required for `TEXT` messages |
| `messageType` | `Enum('TEXT','IMAGE','AUDIO','VIDEO')` | Defaults to `TEXT` |
| `mediaUrl` | `String` | Required for non-text messages |
| `mediaWidth` | `Number` | Pixel width for media messages |
| `mediaHeight` | `Number` | Pixel height for media messages |
| `isDeleted` | `Boolean` | Soft delete flag (admin only) |
| `deletedBy` | `String` (ref `User`) | Admin responsible for deletion |
| `deletedAt` | `Date` | Timestamp of deletion |
| `createdAt/updatedAt` | `Date` | Managed by Mongoose |

### GlobalChatMute
| Field | Type | Notes |
| --- | --- | --- |
| `user` | `String` (ref `User`, unique)` | Muted player |
| `mutedBy` | `String` (ref `User`) | Admin who muted |
| `reason` | `String` | Optional note |
| `expiresAt` | `Date` | Optional auto-unmute time |
| `isActive` | `Boolean` | False when unmuted/expired |

### GlobalChatMessageReport
| Field | Type | Notes |
| --- | --- | --- |
| `message` | `ObjectId` (ref `GlobalChatMessage`) | Reported message |
| `reportedBy` | `ObjectId` (ref `User`) | Reporter |
| `reason` | `String` | Optional reason |
| Unique Index | `(message, reportedBy)` | Prevents duplicate reports |

### GlobalChatUserReport
| Field | Type | Notes |
| --- | --- | --- |
| `reportedUser` | `ObjectId` (ref `User`) | User being reported |
| `reportedBy` | `ObjectId` (ref `User`) | Reporter |
| `message` | `ObjectId` (ref `GlobalChatMessage`, optional)` | Tie report to a specific message |
| `reason` | `String` | Optional |
| Unique Indexes | `(reportedUser, reportedBy)` and `(reportedUser, reportedBy, message)` | Enforces one report per pair (with/without message) |

---

## REST APIs

All routes are mounted under `/api/global-chat` and require:
- `x-api-key` header (`xApi()` middleware)
- Valid JWT (`token({ required: true })`)

### Summary

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /` | User | Paginated chat history (auto-hides reporter’s flagged messages) |
| `GET /online` | User | Current online user count |
| `POST /report/message` | User | Report a message and hide it from the reporter |
| `POST /report/user` | User | Report a chat participant (optional message context) |

### `GET /api/global-chat/`
Retrieve chat history.

**Query Parameters**
| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | `number` | 50 | Max records to return |
| `offset` | `number` | 0 | Records to skip |
| `sortBy` | `string` | `createdAt` | Any indexed field |
| `sortOrder` | `string` | `desc` | `asc` or `desc` |

**Success Response**
```json
{
  "success": true,
  "messages": [
    {
      "id": "64f0...",
      "user": { "id": "5f9...", "name": "Jane" },
      "userName": "Jane",
      "message": "Welcome!",
      "messageType": "TEXT",
      "mediaUrl": null,
      "mediaWidth": null,
      "mediaHeight": null,
      "createdAt": "2025-11-08T12:10:00.000Z"
    }
  ],
  "total": 120,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

Messages that the requester reported are excluded automatically.

### `GET /api/global-chat/online`
Returns the current number of connected users.

```json
{
  "success": true,
  "onlineUsersCount": 34
}
```

### `POST /api/global-chat/report/message`
Report a chat message, hiding it for the reporting user.

**Body**
```json
{
  "messageId": "64f0b2...",
  "reason": "Offensive language"
}
```

**Responses**
- `200` – report stored (idempotent; subsequent requests update the reason)
- `404` – message not found or already deleted
- `500` – unexpected error

### `POST /api/global-chat/report/user`
Escalate a participant to moderators, optionally tying it to a message.

**Body**
```json
{
  "reportedUserId": "5f9ab1...",
  "messageId": "64f0b2...",        // optional
  "reason": "Harassment"
}
```

**Important checks**
- Reporter cannot be the same as `reportedUserId`.
- If `messageId` is provided it must belong to `reportedUserId`.

## Socket Events

Namespace: `/global-chat`

### Authentication
```javascript
const socket = io('https://api.example.com/global-chat', {
  auth: { token: '<jwt-token>' }
});
```

### Client → Server Events

| Event | Payload | Description |
| --- | --- | --- |
| `join-global-chat` | none | Register presence; server responds with `global-chat-joined` |
| `send-message` | `{ messageType, message?, mediaUrl?, mediaWidth?, mediaHeight? }` | Submit text or media message (media requires URL + dimensions) |
| `typing-start` | none | Signal typing indicator |
| `typing-stop` | none | Remove typing indicator |
| `leave-global-chat` | none | Optional explicit disconnect |
| `get-chat-history` | `{ limit?, offset? }` | Request history snapshot via socket |
| `delete-message` *(admin)* | `{ messageId }` | Delete message through socket moderation |

### Server → Client Events

| Event | Payload | When |
| --- | --- | --- |
| `global-chat-joined` | `{ userId, onlineUsersCount }` | After successful join |
| `new-message` | `message` object | Broadcast of newly created message |
| `message-deleted` | `{ messageId }` | When a message is soft deleted |
| `chat-history` | `{ messages, total, pagination }` | Response to `get-chat-history` |
| `online-users-count` | `{ count }` | Periodic updates and on join/leave |
| `user-typing` | `{ userId, userName }` | Another user started typing |
| `user-stopped-typing` | `{ userId }` | Typing indicator cleared |
| `user-muted` | `{ reason, mutedBy, expiresAt }` | Sent to muted user |
| `message-error` | `{ error }` | Validation or authorization issues |

---

## Moderation Flows

### User Reporting a Message
1. Client calls `POST /report/message`.
2. API upserts a report record and records the reason.
3. Reported message ID is stored and excluded from that user’s future history requests.
4. Admin tooling (outside scope) can surface report volume for review.

### User Reporting Another Participant
1. Optional `messageId` ensures the report references the offender’s content.
2. Multiple messages can be reported individually; each pair `(reportedUser, reporter)` has at most one open report per message.
3. Backend stores reports for manual moderation follow-up.

### Admin Muting a User
1. Admin invokes `POST /mute`.
2. Active mute prevents the user from sending new messages (enforced server-side).
3. Socket emits `user-muted` to the affected user with context.
4. `expiresAt` automatically releases the mute when a background job/process evaluates it (implementation detail).

### Admin Deleting a Message
1. Admin calls REST `DELETE /message/:id` or socket `delete-message`.
2. Message flagged with `isDeleted=true`; future history queries exclude it for everyone.
3. Clients receive `message-deleted` broadcast and can remove the content locally.

---

## Usage Examples

### Fetch Chat History (REST)
```javascript
const response = await fetch('/api/global-chat?limit=20', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-api-key': apiKey
  }
});
const data = await response.json();
```

### Report Message (REST)
```javascript
await fetch('/api/global-chat/report/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-api-key': apiKey
  },
  body: JSON.stringify({
    messageId: '64f0b2a...',
    reason: 'Spam links'
  })
});
```

### Send Message (Socket)
```javascript
socket.emit('send-message', {
  messageType: 'TEXT',
  message: 'Good luck everyone!'
});
```

```javascript
socket.emit('send-message', {
  messageType: 'IMAGE',
  mediaUrl: 'https://cdn.example.com/chat/emoji.png',
  mediaWidth: 128,
  mediaHeight: 128
});
```

### Handle Real-Time Updates (Socket)
```javascript
socket.on('new-message', msg => addMessageToFeed(msg));
socket.on('message-deleted', ({ messageId }) => removeMessage(messageId));
socket.on('online-users-count', ({ count }) => updatePresence(count));
```

---

## Testing Checklist

- [ ] Connect to `/global-chat` namespace with valid and invalid tokens
- [ ] Emit `send-message` as muted and non-muted users
- [ ] Verify media messages require `mediaUrl`, `mediaWidth`, and `mediaHeight`
- [ ] Ensure `report/message` hides content for the reporting user only
- [ ] Report same message twice; confirm reason updates and no duplicates created
- [ ] Report user with unrelated message; expect 400 error
- [ ] Admin mute/unmute flow updates `GlobalChatMute` and sends `user-muted`
- [ ] Deleted messages disappear via REST and socket history
- [ ] Pagination returns consistent totals and `hasMore`
- [ ] Online user count increments/decrements on join/leave
- [ ] Role-guarded endpoints reject non-admin access

---

## Security Notes

1. **Authentication** – All traffic (REST + Socket) requires a valid JWT token and API key.
2. **Authorization** – `token({ roles: ['ADMIN'] })` guards administrative routes.
3. **Visibility Rules** – Reported messages are hidden per-user; admins can still see them in the database.
4. **Input Validation** – Controllers enforce message length/type and ensure reporters cannot self-report.
5. **Abuse Prevention** – Consider rate limiting message send/report endpoints (not implemented yet).
6. **Client Responsibilities** – Sanitize rendered HTML to prevent XSS; handle `message-error` gracefully.

---

## Future Enhancements

1. Rate limiting and spam heuristics
2. Admin dashboard for viewing reports and escalating actions
3. Private or group chat rooms
4. Message reactions, editing, and threading
5. Attachment upload pipeline with virus scanning
6. Automated moderation (keyword filters, NLP scoring)

---

## Notes

- Platform follows the domino chat architecture for consistency.
- Socket helpers (`broadcastToGlobalChat`, `notifyUserMuted`) provide reusable hooks for other services.
- Mongo indexes are defined on message timestamps, mute status, and report uniqueness for high throughput.


