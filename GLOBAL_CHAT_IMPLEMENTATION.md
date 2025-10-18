# Global Chat System Implementation

## Overview
A complete socket-based global chat system has been successfully implemented following the existing codebase patterns. The system includes real-time messaging, media support, admin moderation, persistence, and REST API endpoints.

## Files Created

### 1. Database Models
**File:** `/src/api/global_chat/model.js`

Created two MongoDB schemas:
- **GlobalChatMessage**: Stores all chat messages with support for text and media (images, audio, video)
- **GlobalChatMute**: Manages muted users with optional expiration dates

### 2. Socket Implementation
**File:** `/src/services/socket/globalChatSocket.js`

Implemented socket namespace `/global-chat` with the following features:

#### Client Events (received from client):
- `join-global-chat` - User joins global chat
- `send-message` - Send chat message (text or media URL)
- `leave-global-chat` - User leaves global chat
- `typing-start` - User starts typing
- `typing-stop` - User stops typing
- `get-chat-history` - Request chat history with pagination
- `delete-message` - Admin deletes a message (admin only)

#### Server Events (emitted to clients):
- `global-chat-joined` - Successful join confirmation
- `new-message` - Broadcast new message to all users
- `message-deleted` - Broadcast message deletion
- `user-joined` - Notify when user joins
- `user-left` - Notify when user leaves
- `user-typing` - Broadcast typing indicator
- `user-stopped-typing` - Broadcast stop typing
- `online-users-count` - Broadcast online user count
- `chat-history` - Return paginated chat history
- `message-error` - Error sending message
- `user-muted` - User was muted notification

#### Helper Functions Exported:
- `broadcastToGlobalChat(event, data)` - Broadcast to all users
- `getOnlineUsersCount()` - Get current online users count
- `notifyUserMuted(userId, muteInfo)` - Notify specific user they were muted

### 3. REST API Controller
**File:** `/src/api/global_chat/controller.js`

Implemented the following controller functions:
- `getChatHistory` - Get paginated chat history (authenticated users)
- `deleteMessage` - Admin soft-deletes a message (admin only)
- `muteUser` - Admin mutes a user from global chat (admin only)
- `unmuteUser` - Admin unmutes a user (admin only)
- `getMutedUsers` - Get list of muted users (admin only)
- `getOnlineUsers` - Get current online users count (authenticated users)

### 4. REST API Routes
**File:** `/src/api/global_chat/index.js`

Created the following REST endpoints:
- `GET /global-chat/` - Get chat history (authenticated)
- `GET /global-chat/online` - Get online users count (authenticated)
- `GET /global-chat/muted` - Get muted users list (admin only)
- `DELETE /global-chat/message/:messageId` - Delete message (admin only)
- `POST /global-chat/mute` - Mute user (admin only)
- `DELETE /global-chat/mute/:userId` - Unmute user (admin only)

## Files Modified

### 1. Socket Registration
**File:** `/src/services/socket/index.js`
- Imported `initializeGlobalChatSocket`
- Added initialization call for global chat socket namespace

### 2. API Routes Registration
**File:** `/src/api/index.js`
- Imported global_chat routes
- Registered route: `router.use('/global-chat', globalChat)`

## Key Features Implemented

### 1. Authentication
- JWT authentication middleware for both socket and HTTP connections
- User identity attached to all socket connections (userId, role, userName)

### 2. Message Validation
- Text messages: Max 500 characters, required, non-empty
- Media messages: Require valid mediaUrl
- Message type validation (TEXT, IMAGE, AUDIO, VIDEO)

### 3. Mute System
- Admins can mute/unmute users
- Optional expiration dates for temporary mutes
- Auto-expiration checking
- Real-time notification to muted users
- Prevents muted users from sending messages

### 4. Soft Delete
- Messages are soft-deleted (isDeleted flag)
- Tracks who deleted the message and when
- Deleted messages excluded from history queries

### 5. Real-time Features
- User join/leave notifications
- Typing indicators
- Online users count tracking
- Message broadcasting to all connected users

### 6. Pagination
- Chat history supports limit/offset pagination
- Returns total count and hasMore flag
- Configurable sorting

### 7. Admin Moderation
- Delete messages via socket or REST API
- Mute/unmute users
- View list of all muted users
- Role-based access control

## Database Schema Details

### GlobalChatMessage
```javascript
{
  user: String (ref to User),
  userName: String,
  message: String,
  messageType: String (TEXT, IMAGE, AUDIO, VIDEO),
  mediaUrl: String,
  isDeleted: Boolean,
  deletedBy: String (ref to User),
  deletedAt: Date,
  timestamps: true (createdAt, updatedAt)
}
```

### GlobalChatMute
```javascript
{
  user: String (ref to User, unique),
  mutedBy: String (ref to User),
  reason: String,
  expiresAt: Date (optional),
  isActive: Boolean,
  timestamps: true (createdAt, updatedAt)
}
```

## Usage Examples

### Socket Connection (Client Side)
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000/global-chat', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join global chat
socket.emit('join-global-chat');

// Send text message
socket.emit('send-message', {
  messageType: 'TEXT',
  message: 'Hello everyone!'
});

// Send image message
socket.emit('send-message', {
  messageType: 'IMAGE',
  mediaUrl: 'https://example.com/image.jpg'
});

// Listen for new messages
socket.on('new-message', (data) => {
  console.log('New message:', data);
});

// Listen for online users count
socket.on('online-users-count', (data) => {
  console.log('Online users:', data.count);
});

// Typing indicators
socket.emit('typing-start');
socket.emit('typing-stop');
```

### REST API Usage
```javascript
// Get chat history
GET /api/global-chat/?limit=50&offset=0

// Get online users count
GET /api/global-chat/online

// Delete message (admin only)
DELETE /api/global-chat/message/messageId123

// Mute user (admin only)
POST /api/global-chat/mute
Body: {
  userId: 'user123',
  reason: 'Spam',
  expiresAt: '2025-10-20T00:00:00Z' // optional
}

// Unmute user (admin only)
DELETE /api/global-chat/mute/user123

// Get muted users (admin only)
GET /api/global-chat/muted?limit=50&offset=0
```

## Testing Checklist

- [ ] User can connect to global chat socket
- [ ] User can send text messages
- [ ] User can send media messages (images, audio, video)
- [ ] Messages are broadcasted to all connected users
- [ ] Chat history is retrieved correctly
- [ ] Typing indicators work
- [ ] Online users count updates correctly
- [ ] Admin can delete messages via socket
- [ ] Admin can delete messages via REST API
- [ ] Admin can mute users
- [ ] Admin can unmute users
- [ ] Muted users cannot send messages
- [ ] Muted users receive notification when muted
- [ ] Temporary mutes expire correctly
- [ ] User join/leave notifications work
- [ ] Authentication is enforced
- [ ] Non-admin users cannot access admin endpoints

## Security Considerations

1. **Authentication**: JWT token required for all socket and HTTP connections
2. **Authorization**: Admin role checked for moderation actions
3. **Input Validation**: Message length limits and type validation
4. **Soft Deletes**: Messages are never permanently deleted from database
5. **Rate Limiting**: Consider adding rate limiting for message sending (not implemented yet)
6. **XSS Protection**: Client should sanitize HTML in messages before rendering

## Future Enhancements (Optional)

1. Rate limiting for message sending
2. User blocking/reporting
3. Private direct messages
4. Message reactions/emojis
5. Message editing
6. File upload integration
7. Message search functionality
8. User status (online/offline/away)
9. Read receipts
10. Message threading/replies

## Notes

- The implementation follows the existing domino chat pattern
- All code follows the established coding style
- Socket namespace isolation prevents conflicts
- Database indexes optimize query performance
- Exports allow programmatic access to socket functions

