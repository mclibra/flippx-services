# Global Chat API Testing Guide

This guide will help you test the Global Chat REST API endpoints using Postman, cURL, or any API testing tool.

## Prerequisites

1. Running FlippX backend server
2. Valid JWT token from user authentication
3. Admin JWT token for admin endpoints

## Getting Your JWT Token

First, authenticate and get your JWT token:

```bash
POST /api/oauth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

Save this token for use in the following requests.

## Environment Setup

### Postman Environment Variables

Create a Postman environment with these variables:

```
BASE_URL: http://localhost:3000/api
JWT_TOKEN: your-jwt-token-here
ADMIN_TOKEN: admin-jwt-token-here
```

## API Endpoints

### 1. Get Chat History

Get paginated chat messages.

**Endpoint:** `GET /global-chat/`

**Authentication:** Required (User)

**Query Parameters:**
- `limit` (optional, default: 50) - Number of messages
- `offset` (optional, default: 0) - Pagination offset
- `sortBy` (optional, default: 'createdAt')
- `sortOrder` (optional, default: 'desc')

**cURL Example:**
```bash
curl -X GET \
  'http://localhost:3000/api/global-chat/?limit=50&offset=0' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Postman:**
```
GET {{BASE_URL}}/global-chat/?limit=50&offset=0
Headers:
  Authorization: Bearer {{JWT_TOKEN}}
  Content-Type: application/json
```

**Success Response (200):**
```json
{
  "success": true,
  "messages": [
    {
      "id": "message-id-123",
      "user": "user-id-456",
      "userName": "John Doe",
      "message": "Hello everyone!",
      "messageType": "TEXT",
      "mediaUrl": null,
      "createdAt": "2025-10-18T10:30:00.000Z",
      "updatedAt": "2025-10-18T10:30:00.000Z"
    }
  ],
  "total": 150,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 2. Get Online Users Count

Get current number of online users in global chat.

**Endpoint:** `GET /global-chat/online`

**Authentication:** Required (User)

**cURL Example:**
```bash
curl -X GET \
  'http://localhost:3000/api/global-chat/online' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Postman:**
```
GET {{BASE_URL}}/global-chat/online
Headers:
  Authorization: Bearer {{JWT_TOKEN}}
  Content-Type: application/json
```

**Success Response (200):**
```json
{
  "success": true,
  "onlineUsersCount": 42
}
```

---

### 3. Delete Message (Admin Only)

Soft delete a chat message.

**Endpoint:** `DELETE /global-chat/message/:messageId`

**Authentication:** Required (Admin)

**URL Parameters:**
- `messageId` - The ID of the message to delete

**cURL Example:**
```bash
curl -X DELETE \
  'http://localhost:3000/api/global-chat/message/message-id-123' \
  -H 'Authorization: Bearer ADMIN_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Postman:**
```
DELETE {{BASE_URL}}/global-chat/message/message-id-123
Headers:
  Authorization: Bearer {{ADMIN_TOKEN}}
  Content-Type: application/json
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "Only admins can delete messages"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Message not found"
}
```

---

### 4. Mute User (Admin Only)

Mute a user from global chat.

**Endpoint:** `POST /global-chat/mute`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "userId": "user-id-789",
  "reason": "Spam or inappropriate behavior",
  "expiresAt": "2025-10-20T00:00:00.000Z"
}
```

**Body Parameters:**
- `userId` (required) - User ID to mute
- `reason` (optional) - Reason for muting
- `expiresAt` (optional) - Expiration date (ISO 8601 format). Omit for permanent mute.

**cURL Example:**
```bash
curl -X POST \
  'http://localhost:3000/api/global-chat/mute' \
  -H 'Authorization: Bearer ADMIN_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user-id-789",
    "reason": "Spam",
    "expiresAt": "2025-10-20T00:00:00.000Z"
  }'
```

**Postman:**
```
POST {{BASE_URL}}/global-chat/mute
Headers:
  Authorization: Bearer {{ADMIN_TOKEN}}
  Content-Type: application/json
Body (raw JSON):
{
  "userId": "user-id-789",
  "reason": "Spam",
  "expiresAt": "2025-10-20T00:00:00.000Z"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User muted successfully",
  "mute": {
    "id": "mute-id-123",
    "user": "user-id-789",
    "mutedBy": "admin-id-456",
    "reason": "Spam",
    "expiresAt": "2025-10-20T00:00:00.000Z",
    "isActive": true,
    "createdAt": "2025-10-18T10:30:00.000Z"
  }
}
```

**Error Response (409):**
```json
{
  "success": false,
  "error": "User is already muted"
}
```

---

### 5. Unmute User (Admin Only)

Remove mute from a user.

**Endpoint:** `DELETE /global-chat/mute/:userId`

**Authentication:** Required (Admin)

**URL Parameters:**
- `userId` - The ID of the user to unmute

**cURL Example:**
```bash
curl -X DELETE \
  'http://localhost:3000/api/global-chat/mute/user-id-789' \
  -H 'Authorization: Bearer ADMIN_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Postman:**
```
DELETE {{BASE_URL}}/global-chat/mute/user-id-789
Headers:
  Authorization: Bearer {{ADMIN_TOKEN}}
  Content-Type: application/json
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User unmuted successfully"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "User is not currently muted"
}
```

---

### 6. Get Muted Users List (Admin Only)

Get list of all muted users.

**Endpoint:** `GET /global-chat/muted`

**Authentication:** Required (Admin)

**Query Parameters:**
- `limit` (optional, default: 50) - Number of records
- `offset` (optional, default: 0) - Pagination offset
- `includeExpired` (optional, default: false) - Include expired/inactive mutes

**cURL Example:**
```bash
curl -X GET \
  'http://localhost:3000/api/global-chat/muted?limit=50&offset=0&includeExpired=false' \
  -H 'Authorization: Bearer ADMIN_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Postman:**
```
GET {{BASE_URL}}/global-chat/muted?limit=50&offset=0&includeExpired=false
Headers:
  Authorization: Bearer {{ADMIN_TOKEN}}
  Content-Type: application/json
```

**Success Response (200):**
```json
{
  "success": true,
  "mutedUsers": [
    {
      "id": "mute-id-123",
      "user": {
        "id": "user-id-789",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "mutedBy": {
        "id": "admin-id-456",
        "name": "Admin User"
      },
      "reason": "Spam",
      "expiresAt": "2025-10-20T00:00:00.000Z",
      "isActive": true,
      "createdAt": "2025-10-18T10:30:00.000Z"
    }
  ],
  "total": 5,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## Socket.IO Testing

You can also test Socket.IO events using tools like:
- Socket.IO Client (browser extension)
- Postman (supports WebSocket)
- Custom HTML test page

### HTML Test Page

Create a file `test-chat.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Global Chat Test</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>Global Chat Test</h1>
  
  <div>
    <input id="token" placeholder="JWT Token" style="width: 500px" />
    <button onclick="connect()">Connect</button>
    <button onclick="disconnect()">Disconnect</button>
  </div>
  
  <div>
    <input id="message" placeholder="Type message..." style="width: 400px" />
    <button onclick="sendMessage()">Send</button>
  </div>
  
  <div id="status"></div>
  <div id="messages" style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; height: 400px; overflow-y: scroll;"></div>

  <script>
    let socket;
    const messagesDiv = document.getElementById('messages');
    const statusDiv = document.getElementById('status');

    function connect() {
      const token = document.getElementById('token').value;
      
      socket = io('http://localhost:3000/global-chat', {
        auth: { token: token }
      });

      socket.on('connect', () => {
        statusDiv.innerHTML = '<span style="color: green">Connected</span>';
        socket.emit('join-global-chat', {});
      });

      socket.on('disconnect', () => {
        statusDiv.innerHTML = '<span style="color: red">Disconnected</span>';
      });

      socket.on('global-chat-joined', (data) => {
        addLog('Joined global chat: ' + JSON.stringify(data));
      });

      socket.on('new-message', (data) => {
        addMessage(data);
      });

      socket.on('online-users-count', (data) => {
        statusDiv.innerHTML += ` | Online: ${data.count}`;
      });

      socket.on('user-joined', (data) => {
        addLog(`${data.userName} joined`);
      });

      socket.on('user-left', (data) => {
        addLog(`${data.userName} left`);
      });

      socket.on('message-error', (data) => {
        addLog('ERROR: ' + data.error, 'red');
      });
    }

    function disconnect() {
      if (socket) {
        socket.emit('leave-global-chat', {});
        socket.disconnect();
      }
    }

    function sendMessage() {
      const message = document.getElementById('message').value;
      if (socket && message) {
        socket.emit('send-message', {
          messageType: 'TEXT',
          message: message
        });
        document.getElementById('message').value = '';
      }
    }

    function addMessage(data) {
      const div = document.createElement('div');
      div.innerHTML = `<strong>${data.userName}:</strong> ${data.message} <small>(${new Date(data.timestamp).toLocaleTimeString()})</small>`;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function addLog(text, color = 'gray') {
      const div = document.createElement('div');
      div.style.color = color;
      div.innerHTML = `<em>${text}</em>`;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  </script>
</body>
</html>
```

Open this file in a browser to test the socket connection.

---

## Postman Collection

Here's a complete Postman collection JSON you can import:

```json
{
  "info": {
    "name": "FlippX Global Chat API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Chat History",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{JWT_TOKEN}}"
          }
        ],
        "url": {
          "raw": "{{BASE_URL}}/global-chat/?limit=50&offset=0",
          "host": ["{{BASE_URL}}"],
          "path": ["global-chat"],
          "query": [
            {"key": "limit", "value": "50"},
            {"key": "offset", "value": "0"}
          ]
        }
      }
    },
    {
      "name": "Get Online Users",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{JWT_TOKEN}}"
          }
        ],
        "url": "{{BASE_URL}}/global-chat/online"
      }
    },
    {
      "name": "Delete Message (Admin)",
      "request": {
        "method": "DELETE",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{ADMIN_TOKEN}}"
          }
        ],
        "url": "{{BASE_URL}}/global-chat/message/:messageId"
      }
    },
    {
      "name": "Mute User (Admin)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{ADMIN_TOKEN}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"userId\": \"user-id-here\",\n  \"reason\": \"Spam\",\n  \"expiresAt\": \"2025-10-20T00:00:00.000Z\"\n}"
        },
        "url": "{{BASE_URL}}/global-chat/mute"
      }
    },
    {
      "name": "Unmute User (Admin)",
      "request": {
        "method": "DELETE",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{ADMIN_TOKEN}}"
          }
        ],
        "url": "{{BASE_URL}}/global-chat/mute/:userId"
      }
    },
    {
      "name": "Get Muted Users (Admin)",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{ADMIN_TOKEN}}"
          }
        ],
        "url": {
          "raw": "{{BASE_URL}}/global-chat/muted?limit=50&offset=0",
          "host": ["{{BASE_URL}}"],
          "path": ["global-chat", "muted"],
          "query": [
            {"key": "limit", "value": "50"},
            {"key": "offset", "value": "0"}
          ]
        }
      }
    }
  ]
}
```

---

## Testing Workflow

1. **Get JWT Token**
   - Login via `/api/oauth/login`
   - Save the token

2. **Test User Endpoints**
   - Get chat history
   - Get online users count

3. **Test Admin Endpoints** (requires admin token)
   - Mute a user
   - Get muted users list
   - Delete a message
   - Unmute a user

4. **Test Socket Connection**
   - Use HTML test page or Socket.IO client
   - Join chat
   - Send messages
   - Test typing indicators

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Only admins can perform this action"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error message"
}
```

---

## Tips for Testing

1. **Use Environment Variables** in Postman for easy switching between dev/staging/prod
2. **Save Responses** to verify data structure
3. **Test Error Cases** (invalid tokens, missing fields, etc.)
4. **Test Pagination** with different limit/offset values
5. **Test Socket Events** alongside REST API
6. **Monitor Server Logs** for debugging

---

## Next Steps

After testing the API:
1. Integrate into your Flutter app using the Flutter Integration Guide
2. Implement error handling for all edge cases
3. Add loading states and user feedback
4. Test on real devices
5. Deploy to production

---

**Related Documentation:**
- `FLUTTER_INTEGRATION_GUIDE.md` - Complete Flutter integration
- `FLUTTER_QUICK_REFERENCE.md` - Quick code snippets
- `GLOBAL_CHAT_IMPLEMENTATION.md` - Backend implementation details

