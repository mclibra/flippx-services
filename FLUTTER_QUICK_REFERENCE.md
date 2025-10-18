# Flutter Global Chat - Quick Reference

## Quick Setup (5 minutes)

### 1. Add Dependencies
```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^2.0.3+1
  http: ^1.1.0
  provider: ^6.1.1
```

### 2. Basic Implementation

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class QuickChat {
  IO.Socket? socket;
  
  // Connect
  void connect(String jwtToken) {
    socket = IO.io(
      'https://your-server.com/global-chat',
      IO.OptionBuilder()
          .setAuth({'token': jwtToken})
          .build(),
    );
    
    socket!.connect();
    socket!.emit('join-global-chat', {});
  }
  
  // Send message
  void send(String message) {
    socket!.emit('send-message', {
      'messageType': 'TEXT',
      'message': message,
    });
  }
  
  // Listen to messages
  void listen(Function(dynamic) callback) {
    socket!.on('new-message', callback);
  }
  
  // Disconnect
  void disconnect() {
    socket!.emit('leave-global-chat', {});
    socket!.disconnect();
  }
}
```

### 3. Usage

```dart
// In your widget
final chat = QuickChat();

// Connect
chat.connect('your-jwt-token');

// Listen
chat.listen((data) {
  print('New message: ${data['message']}');
});

// Send
chat.send('Hello!');

// Cleanup
chat.disconnect();
```

## Socket Events Reference

### Emit (Client → Server)

| Event | Data | Description |
|-------|------|-------------|
| `join-global-chat` | `{}` | Join the chat |
| `send-message` | `{messageType, message, mediaUrl}` | Send message |
| `typing-start` | `{}` | Start typing |
| `typing-stop` | `{}` | Stop typing |
| `get-chat-history` | `{limit, offset}` | Get history |
| `leave-global-chat` | `{}` | Leave chat |
| `delete-message` | `{messageId}` | Delete (admin) |

### Listen (Server → Client)

| Event | Data | Description |
|-------|------|-------------|
| `global-chat-joined` | `{success, message}` | Join confirmed |
| `new-message` | `{messageId, user, userName, message, timestamp}` | New message |
| `user-joined` | `{userId, userName, timestamp}` | User joined |
| `user-left` | `{userId, userName, timestamp}` | User left |
| `user-typing` | `{userId, userName}` | User typing |
| `user-stopped-typing` | `{userId, userName}` | Stopped typing |
| `online-users-count` | `{count, timestamp}` | Online count |
| `message-deleted` | `{messageId, deletedBy}` | Message deleted |
| `user-muted` | `{muteInfo}` | You were muted |
| `message-error` | `{error}` | Error occurred |

## REST API Reference

Base URL: `https://your-server.com/api/global-chat`

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | User | Get chat history |
| GET | `/online` | User | Online count |
| GET | `/muted` | Admin | List muted users |
| DELETE | `/message/:id` | Admin | Delete message |
| POST | `/mute` | Admin | Mute user |
| DELETE | `/mute/:userId` | Admin | Unmute user |

### Examples

```dart
// Get history
final response = await http.get(
  Uri.parse('$baseUrl/global-chat/?limit=50'),
  headers: {'Authorization': 'Bearer $token'},
);

// Mute user (admin)
await http.post(
  Uri.parse('$baseUrl/global-chat/mute'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'userId': 'user123',
    'reason': 'Spam',
    'expiresAt': '2025-10-20T00:00:00Z', // optional
  }),
);
```

## Message Types

```dart
// Text message
socket.emit('send-message', {
  'messageType': 'TEXT',
  'message': 'Hello!',
});

// Image
socket.emit('send-message', {
  'messageType': 'IMAGE',
  'mediaUrl': 'https://example.com/image.jpg',
});

// Audio
socket.emit('send-message', {
  'messageType': 'AUDIO',
  'mediaUrl': 'https://example.com/audio.mp3',
});

// Video
socket.emit('send-message', {
  'messageType': 'VIDEO',
  'mediaUrl': 'https://example.com/video.mp4',
});
```

## Common Code Snippets

### Typing Indicator with Debounce

```dart
Timer? _typingTimer;

void onTextChanged(String text) {
  _typingTimer?.cancel();
  
  if (text.isNotEmpty) {
    socket.emit('typing-start', {});
    
    _typingTimer = Timer(Duration(seconds: 2), () {
      socket.emit('typing-stop', {});
    });
  }
}
```

### Auto-scroll to Bottom

```dart
void scrollToBottom() {
  Future.delayed(Duration(milliseconds: 100), () {
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  });
}
```

### Paginated History Loading

```dart
int _offset = 0;
final int _limit = 50;

void loadMore() {
  socket.emit('get-chat-history', {
    'limit': _limit,
    'offset': _offset,
  });
  _offset += _limit;
}

// Listen for history
socket.on('chat-history', (data) {
  final messages = data['messages'] as List;
  final hasMore = data['pagination']['hasMore'];
  // Update UI
});
```

### Connection Status Widget

```dart
class ConnectionStatus extends StatelessWidget {
  final bool isConnected;

  const ConnectionStatus({required this.isConnected});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(8),
      color: isConnected ? Colors.green : Colors.red,
      child: Text(
        isConnected ? 'Connected' : 'Disconnected',
        style: TextStyle(color: Colors.white),
      ),
    );
  }
}
```

### Error Handling

```dart
socket.on('message-error', (data) {
  final error = data['error'];
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(error),
      backgroundColor: Colors.red,
    ),
  );
});

socket.on('connect_error', (error) {
  print('Connection error: $error');
  // Show retry dialog
});
```

## State Management Patterns

### Using Provider

```dart
// 1. Create provider
class ChatProvider extends ChangeNotifier {
  List<Message> messages = [];
  
  void addMessage(Message msg) {
    messages.add(msg);
    notifyListeners();
  }
}

// 2. Provide it
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => ChatProvider()),
  ],
  child: MyApp(),
)

// 3. Consume it
Consumer<ChatProvider>(
  builder: (context, chat, child) {
    return ListView.builder(
      itemCount: chat.messages.length,
      itemBuilder: (context, index) {
        return MessageBubble(chat.messages[index]);
      },
    );
  },
)
```

### Using StreamBuilder

```dart
StreamBuilder<ChatMessage>(
  stream: chatService.messagesStream,
  builder: (context, snapshot) {
    if (!snapshot.hasData) {
      return CircularProgressIndicator();
    }
    
    return MessageBubble(snapshot.data!);
  },
)
```

## Testing Checklist

- [ ] Socket connects with valid JWT
- [ ] Can send text message
- [ ] Can send image message
- [ ] Receives messages from others
- [ ] Typing indicator works
- [ ] Online count updates
- [ ] Chat history loads
- [ ] Message deletion works (if admin)
- [ ] Handles connection errors
- [ ] Handles mute notification
- [ ] Disconnects properly
- [ ] Reconnects after network loss

## Configuration

### Development
```dart
static const String serverUrl = 'http://localhost:3000';
```

### Production
```dart
static const String serverUrl = 'https://api.flippx.com';
```

### Environment Variables
```dart
// Use flutter_dotenv or similar
static final String serverUrl = dotenv.env['SERVER_URL'] ?? 'http://localhost:3000';
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Socket won't connect | Check server URL and JWT token |
| Messages not showing | Verify event listeners are set up |
| Typing indicator stuck | Call `typing-stop` on dispose |
| Memory leak | Dispose StreamControllers |
| Images not loading | Check CORS and URL validity |
| Connection drops | Implement reconnection logic |

## Performance Tips

```dart
// 1. Limit message list
if (messages.length > 1000) {
  messages = messages.sublist(messages.length - 500);
}

// 2. Use const widgets
const MessageBubble(message: message)

// 3. Lazy load images
CachedNetworkImage(
  imageUrl: mediaUrl,
  placeholder: (context, url) => CircularProgressIndicator(),
)

// 4. Debounce scroll events
ScrollController controller;
Timer? scrollTimer;

controller.addListener(() {
  scrollTimer?.cancel();
  scrollTimer = Timer(Duration(milliseconds: 500), () {
    // Load more if at bottom
  });
});
```

## Security Checklist

- [ ] JWT token stored securely
- [ ] Token refreshed before expiry
- [ ] Messages sanitized before display
- [ ] HTTPS used in production
- [ ] Rate limiting on sends
- [ ] Validate URLs before loading
- [ ] Handle XSS in messages

---

**Full Documentation**: See `FLUTTER_INTEGRATION_GUIDE.md` for detailed implementation.

