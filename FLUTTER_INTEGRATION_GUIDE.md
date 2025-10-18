# Flutter Global Chat Integration Guide

This guide will help you integrate the FlippX Global Chat system into your Flutter application.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Dependencies](#dependencies)
3. [Setup Socket Connection](#setup-socket-connection)
4. [Chat Service Implementation](#chat-service-implementation)
5. [UI Implementation](#ui-implementation)
6. [REST API Integration](#rest-api-integration)
7. [Best Practices](#best-practices)
8. [Complete Example](#complete-example)

## Prerequisites

- Flutter SDK installed
- Access to your JWT authentication token
- Server URL where the FlippX backend is running

## Dependencies

Add these dependencies to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # Socket.IO client for Flutter
  socket_io_client: ^2.0.3+1
  
  # HTTP client for REST API calls
  http: ^1.1.0
  
  # State management (choose one)
  provider: ^6.1.1  # or riverpod, bloc, etc.
  
  # For JSON serialization
  json_annotation: ^4.8.1
  
  # For handling file uploads (if needed)
  dio: ^5.4.0
  
  # Optional: For image/media handling
  cached_network_image: ^3.3.1
  image_picker: ^1.0.7

dev_dependencies:
  build_runner: ^2.4.7
  json_serializable: ^6.7.1
```

## Setup Socket Connection

### 1. Create Socket Manager Class

Create a file `lib/services/socket_manager.dart`:

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketManager {
  static final SocketManager _instance = SocketManager._internal();
  factory SocketManager() => _instance;
  SocketManager._internal();

  IO.Socket? _socket;
  bool _isConnected = false;

  // Server configuration
  static const String serverUrl = 'https://your-server.com'; // Replace with your server URL
  
  bool get isConnected => _isConnected;
  IO.Socket? get socket => _socket;

  // Initialize socket connection with JWT token
  Future<void> connect(String jwtToken) async {
    if (_socket != null && _isConnected) {
      print('Socket already connected');
      return;
    }

    try {
      _socket = IO.io(
        '$serverUrl/global-chat',
        IO.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableAutoConnect()
            .enableReconnection()
            .setAuth({
              'token': jwtToken,
            })
            .build(),
      );

      _setupSocketListeners();
      _socket!.connect();
    } catch (e) {
      print('Error connecting to socket: $e');
    }
  }

  void _setupSocketListeners() {
    _socket?.on('connect', (_) {
      print('Connected to Global Chat Socket');
      _isConnected = true;
    });

    _socket?.on('disconnect', (_) {
      print('Disconnected from Global Chat Socket');
      _isConnected = false;
    });

    _socket?.on('connect_error', (error) {
      print('Connection Error: $error');
      _isConnected = false;
    });

    _socket?.on('error', (error) {
      print('Socket Error: $error');
    });
  }

  // Disconnect socket
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
  }
}
```

### 2. Create Message Model

Create a file `lib/models/chat_message.dart`:

```dart
import 'package:json_annotation/json_annotation.dart';

part 'chat_message.g.dart';

enum MessageType {
  @JsonValue('TEXT')
  text,
  @JsonValue('IMAGE')
  image,
  @JsonValue('AUDIO')
  audio,
  @JsonValue('VIDEO')
  video,
}

@JsonSerializable()
class ChatMessage {
  final String messageId;
  final String user;
  final String userName;
  final String? message;
  final MessageType messageType;
  final String? mediaUrl;
  final DateTime timestamp;
  final bool isDeleted;

  ChatMessage({
    required this.messageId,
    required this.user,
    required this.userName,
    this.message,
    required this.messageType,
    this.mediaUrl,
    required this.timestamp,
    this.isDeleted = false,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);

  Map<String, dynamic> toJson() => _$ChatMessageToJson(this);
}

@JsonSerializable()
class MuteInfo {
  final String reason;
  final String mutedBy;
  final DateTime? expiresAt;

  MuteInfo({
    required this.reason,
    required this.mutedBy,
    this.expiresAt,
  });

  factory MuteInfo.fromJson(Map<String, dynamic> json) =>
      _$MuteInfoFromJson(json);

  Map<String, dynamic> toJson() => _$MuteInfoToJson(this);
}
```

Run code generation:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

## Chat Service Implementation

Create a file `lib/services/global_chat_service.dart`:

```dart
import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/chat_message.dart';
import 'socket_manager.dart';

class GlobalChatService {
  final SocketManager _socketManager = SocketManager();
  
  // Stream controllers for real-time updates
  final _messagesController = StreamController<ChatMessage>.broadcast();
  final _onlineCountController = StreamController<int>.broadcast();
  final _typingUsersController = StreamController<Map<String, bool>>.broadcast();
  final _userJoinedController = StreamController<Map<String, dynamic>>.broadcast();
  final _userLeftController = StreamController<Map<String, dynamic>>.broadcast();
  final _messageDeletedController = StreamController<String>.broadcast();
  final _mutedController = StreamController<MuteInfo>.broadcast();
  final _errorController = StreamController<String>.broadcast();

  // Streams
  Stream<ChatMessage> get messagesStream => _messagesController.stream;
  Stream<int> get onlineCountStream => _onlineCountController.stream;
  Stream<Map<String, bool>> get typingUsersStream => _typingUsersController.stream;
  Stream<Map<String, dynamic>> get userJoinedStream => _userJoinedController.stream;
  Stream<Map<String, dynamic>> get userLeftStream => _userLeftController.stream;
  Stream<String> get messageDeletedStream => _messageDeletedController.stream;
  Stream<MuteInfo> get mutedStream => _mutedController.stream;
  Stream<String> get errorStream => _errorController.stream;

  final Map<String, bool> _typingUsers = {};
  bool _isJoined = false;

  bool get isJoined => _isJoined;

  // Initialize and join global chat
  Future<void> joinGlobalChat(String jwtToken) async {
    await _socketManager.connect(jwtToken);
    _setupEventListeners();
    _emitEvent('join-global-chat', {});
  }

  // Setup all event listeners
  void _setupEventListeners() {
    final socket = _socketManager.socket;
    if (socket == null) return;

    // Join confirmation
    socket.on('global-chat-joined', (data) {
      print('Successfully joined global chat');
      _isJoined = true;
    });

    // New message received
    socket.on('new-message', (data) {
      try {
        final message = ChatMessage.fromJson(data);
        _messagesController.add(message);
      } catch (e) {
        print('Error parsing message: $e');
      }
    });

    // Message deleted
    socket.on('message-deleted', (data) {
      final messageId = data['messageId'] as String;
      _messageDeletedController.add(messageId);
    });

    // User joined
    socket.on('user-joined', (data) {
      _userJoinedController.add(Map<String, dynamic>.from(data));
    });

    // User left
    socket.on('user-left', (data) {
      _userLeftController.add(Map<String, dynamic>.from(data));
      final userId = data['userId'] as String;
      _typingUsers.remove(userId);
      _typingUsersController.add({..._typingUsers});
    });

    // User typing
    socket.on('user-typing', (data) {
      final userId = data['userId'] as String;
      _typingUsers[userId] = true;
      _typingUsersController.add({..._typingUsers});
    });

    // User stopped typing
    socket.on('user-stopped-typing', (data) {
      final userId = data['userId'] as String;
      _typingUsers.remove(userId);
      _typingUsersController.add({..._typingUsers});
    });

    // Online users count
    socket.on('online-users-count', (data) {
      final count = data['count'] as int;
      _onlineCountController.add(count);
    });

    // Chat history
    socket.on('chat-history', (data) {
      // Handle chat history
      print('Chat history received: ${data['total']} messages');
    });

    // User muted
    socket.on('user-muted', (data) {
      if (data['muteInfo'] != null) {
        final muteInfo = MuteInfo.fromJson(data['muteInfo']);
        _mutedController.add(muteInfo);
      }
    });

    // Error handling
    socket.on('message-error', (data) {
      final error = data['error'] as String;
      _errorController.add(error);
    });

    socket.on('join-error', (data) {
      final error = data['error'] as String;
      _errorController.add(error);
    });
  }

  // Send text message
  void sendTextMessage(String message) {
    _emitEvent('send-message', {
      'messageType': 'TEXT',
      'message': message,
    });
  }

  // Send media message
  void sendMediaMessage(String mediaUrl, MessageType type) {
    String messageType;
    switch (type) {
      case MessageType.image:
        messageType = 'IMAGE';
        break;
      case MessageType.audio:
        messageType = 'AUDIO';
        break;
      case MessageType.video:
        messageType = 'VIDEO';
        break;
      default:
        messageType = 'TEXT';
    }

    _emitEvent('send-message', {
      'messageType': messageType,
      'mediaUrl': mediaUrl,
    });
  }

  // Get chat history
  void getChatHistory({int limit = 50, int offset = 0}) {
    _emitEvent('get-chat-history', {
      'limit': limit,
      'offset': offset,
    });
  }

  // Typing indicators
  void startTyping() {
    _emitEvent('typing-start', {});
  }

  void stopTyping() {
    _emitEvent('typing-stop', {});
  }

  // Delete message (admin only)
  void deleteMessage(String messageId) {
    _emitEvent('delete-message', {'messageId': messageId});
  }

  // Leave global chat
  void leaveGlobalChat() {
    _emitEvent('leave-global-chat', {});
    _isJoined = false;
  }

  // Helper method to emit events
  void _emitEvent(String event, Map<String, dynamic> data) {
    final socket = _socketManager.socket;
    if (socket != null && _socketManager.isConnected) {
      socket.emit(event, data);
    } else {
      print('Socket not connected. Cannot emit event: $event');
    }
  }

  // Disconnect
  void disconnect() {
    _socketManager.disconnect();
    _isJoined = false;
  }

  // Cleanup
  void dispose() {
    _messagesController.close();
    _onlineCountController.close();
    _typingUsersController.close();
    _userJoinedController.close();
    _userLeftController.close();
    _messageDeletedController.close();
    _mutedController.close();
    _errorController.close();
  }
}
```

## UI Implementation

### Chat Screen Example

Create a file `lib/screens/global_chat_screen.dart`:

```dart
import 'package:flutter/material.dart';
import '../services/global_chat_service.dart';
import '../models/chat_message.dart';

class GlobalChatScreen extends StatefulWidget {
  final String jwtToken;

  const GlobalChatScreen({Key? key, required this.jwtToken}) : super(key: key);

  @override
  State<GlobalChatScreen> createState() => _GlobalChatScreenState();
}

class _GlobalChatScreenState extends State<GlobalChatScreen> {
  final GlobalChatService _chatService = GlobalChatService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessage> _messages = [];
  
  int _onlineUsers = 0;
  bool _isTyping = false;
  Map<String, bool> _typingUsers = {};
  String? _currentUserId;

  @override
  void initState() {
    super.initState();
    _initializeChat();
  }

  void _initializeChat() async {
    // Join global chat
    await _chatService.joinGlobalChat(widget.jwtToken);
    
    // Request chat history
    _chatService.getChatHistory(limit: 50, offset: 0);
    
    // Listen to new messages
    _chatService.messagesStream.listen((message) {
      setState(() {
        _messages.add(message);
      });
      _scrollToBottom();
    });

    // Listen to online users count
    _chatService.onlineCountStream.listen((count) {
      setState(() {
        _onlineUsers = count;
      });
    });

    // Listen to typing indicators
    _chatService.typingUsersStream.listen((users) {
      setState(() {
        _typingUsers = users;
      });
    });

    // Listen to message deletions
    _chatService.messageDeletedStream.listen((messageId) {
      setState(() {
        _messages.removeWhere((msg) => msg.messageId == messageId);
      });
    });

    // Listen to errors
    _chatService.errorStream.listen((error) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
    });

    // Listen to mute notifications
    _chatService.mutedStream.listen((muteInfo) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('You have been muted'),
          content: Text('Reason: ${muteInfo.reason}'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    });
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    _chatService.sendTextMessage(text);
    _messageController.clear();
    _chatService.stopTyping();
    setState(() {
      _isTyping = false;
    });
  }

  void _onTextChanged(String text) {
    if (text.isNotEmpty && !_isTyping) {
      _chatService.startTyping();
      setState(() {
        _isTyping = true;
      });
    } else if (text.isEmpty && _isTyping) {
      _chatService.stopTyping();
      setState(() {
        _isTyping = false;
      });
    }
  }

  @override
  void dispose() {
    _chatService.leaveGlobalChat();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Global Chat'),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Row(
                children: [
                  const Icon(Icons.people, size: 20),
                  const SizedBox(width: 4),
                  Text('$_onlineUsers online'),
                ],
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                return _buildMessageBubble(message);
              },
            ),
          ),

          // Typing indicator
          if (_typingUsers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(
                '${_typingUsers.length} ${_typingUsers.length == 1 ? "person is" : "people are"} typing...',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),

          // Message input
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 4,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    onChanged: _onTextChanged,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                    ),
                    maxLength: 500,
                    buildCounter: (context,
                        {required currentLength,
                        required isFocused,
                        maxLength}) {
                      return Text('$currentLength/$maxLength');
                    },
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _sendMessage,
                  icon: const Icon(Icons.send),
                  color: Theme.of(context).primaryColor,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage message) {
    final isCurrentUser = message.user == _currentUserId;

    return Align(
      alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.7,
        ),
        decoration: BoxDecoration(
          color: isCurrentUser ? Colors.blue : Colors.grey[300],
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isCurrentUser)
              Text(
                message.userName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            const SizedBox(height: 4),
            _buildMessageContent(message),
            const SizedBox(height: 4),
            Text(
              _formatTimestamp(message.timestamp),
              style: TextStyle(
                fontSize: 10,
                color: isCurrentUser ? Colors.white70 : Colors.black54,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(ChatMessage message) {
    switch (message.messageType) {
      case MessageType.text:
        return Text(
          message.message ?? '',
          style: TextStyle(
            color: message.user == _currentUserId ? Colors.white : Colors.black87,
          ),
        );
      case MessageType.image:
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            message.mediaUrl!,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return const CircularProgressIndicator();
            },
          ),
        );
      case MessageType.audio:
        return Row(
          children: [
            const Icon(Icons.audio_file),
            const SizedBox(width: 8),
            const Text('Audio message'),
          ],
        );
      case MessageType.video:
        return Row(
          children: [
            const Icon(Icons.video_file),
            const SizedBox(width: 8),
            const Text('Video message'),
          ],
        );
    }
  }

  String _formatTimestamp(DateTime timestamp) {
    final now = DateTime.now();
    final difference = now.difference(timestamp);

    if (difference.inMinutes < 1) {
      return 'Just now';
    } else if (difference.inHours < 1) {
      return '${difference.inMinutes}m ago';
    } else if (difference.inDays < 1) {
      return '${difference.inHours}h ago';
    } else {
      return '${timestamp.day}/${timestamp.month}/${timestamp.year}';
    }
  }
}
```

## REST API Integration

Create a file `lib/services/chat_api_service.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ChatApiService {
  static const String baseUrl = 'https://your-server.com/api'; // Replace with your server URL
  final String jwtToken;

  ChatApiService({required this.jwtToken});

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $jwtToken',
      };

  // Get chat history via REST API
  Future<Map<String, dynamic>> getChatHistory({
    int limit = 50,
    int offset = 0,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/global-chat/?limit=$limit&offset=$offset'),
        headers: _headers,
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Failed to load chat history');
      }
    } catch (e) {
      throw Exception('Error fetching chat history: $e');
    }
  }

  // Get online users count
  Future<int> getOnlineUsersCount() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/global-chat/online'),
        headers: _headers,
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['onlineUsersCount'] as int;
      } else {
        throw Exception('Failed to load online users count');
      }
    } catch (e) {
      throw Exception('Error fetching online users: $e');
    }
  }

  // Admin: Delete message
  Future<bool> deleteMessage(String messageId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/global-chat/message/$messageId'),
        headers: _headers,
      );

      return response.statusCode == 200;
    } catch (e) {
      throw Exception('Error deleting message: $e');
    }
  }

  // Admin: Mute user
  Future<bool> muteUser({
    required String userId,
    String? reason,
    DateTime? expiresAt,
  }) async {
    try {
      final body = {
        'userId': userId,
        if (reason != null) 'reason': reason,
        if (expiresAt != null) 'expiresAt': expiresAt.toIso8601String(),
      };

      final response = await http.post(
        Uri.parse('$baseUrl/global-chat/mute'),
        headers: _headers,
        body: json.encode(body),
      );

      return response.statusCode == 200;
    } catch (e) {
      throw Exception('Error muting user: $e');
    }
  }

  // Admin: Unmute user
  Future<bool> unmuteUser(String userId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/global-chat/mute/$userId'),
        headers: _headers,
      );

      return response.statusCode == 200;
    } catch (e) {
      throw Exception('Error unmuting user: $e');
    }
  }

  // Admin: Get muted users list
  Future<Map<String, dynamic>> getMutedUsers({
    int limit = 50,
    int offset = 0,
    bool includeExpired = false,
  }) async {
    try {
      final response = await http.get(
        Uri.parse(
          '$baseUrl/global-chat/muted?limit=$limit&offset=$offset&includeExpired=$includeExpired',
        ),
        headers: _headers,
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Failed to load muted users');
      }
    } catch (e) {
      throw Exception('Error fetching muted users: $e');
    }
  }
}
```

## Best Practices

### 1. State Management with Provider

Create a file `lib/providers/chat_provider.dart`:

```dart
import 'package:flutter/foundation.dart';
import '../models/chat_message.dart';
import '../services/global_chat_service.dart';

class ChatProvider extends ChangeNotifier {
  final GlobalChatService _chatService = GlobalChatService();
  final List<ChatMessage> _messages = [];
  int _onlineUsers = 0;
  bool _isConnected = false;
  bool _isMuted = false;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  int get onlineUsers => _onlineUsers;
  bool get isConnected => _isConnected;
  bool get isMuted => _isMuted;

  Future<void> initialize(String jwtToken) async {
    await _chatService.joinGlobalChat(jwtToken);
    _setupListeners();
    _isConnected = true;
    notifyListeners();
  }

  void _setupListeners() {
    _chatService.messagesStream.listen((message) {
      _messages.add(message);
      notifyListeners();
    });

    _chatService.onlineCountStream.listen((count) {
      _onlineUsers = count;
      notifyListeners();
    });

    _chatService.messageDeletedStream.listen((messageId) {
      _messages.removeWhere((msg) => msg.messageId == messageId);
      notifyListeners();
    });

    _chatService.mutedStream.listen((muteInfo) {
      _isMuted = true;
      notifyListeners();
    });
  }

  void sendMessage(String message) {
    if (!_isMuted) {
      _chatService.sendTextMessage(message);
    }
  }

  void sendMediaMessage(String mediaUrl, MessageType type) {
    if (!_isMuted) {
      _chatService.sendMediaMessage(mediaUrl, type);
    }
  }

  @override
  void dispose() {
    _chatService.dispose();
    super.dispose();
  }
}
```

### 2. Error Handling

Always wrap socket operations in try-catch blocks and provide user feedback:

```dart
try {
  await _chatService.joinGlobalChat(jwtToken);
} catch (e) {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Connection Error'),
      content: Text('Failed to join chat: $e'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}
```

### 3. Lifecycle Management

```dart
@override
void initState() {
  super.initState();
  // Join chat
  _chatService.joinGlobalChat(widget.jwtToken);
}

@override
void dispose() {
  // Always leave chat when screen is disposed
  _chatService.leaveGlobalChat();
  super.dispose();
}
```

### 4. Reconnection Handling

```dart
class ChatReconnectionHandler {
  final GlobalChatService chatService;
  Timer? _reconnectionTimer;

  ChatReconnectionHandler(this.chatService);

  void startMonitoring() {
    _reconnectionTimer = Timer.periodic(
      const Duration(seconds: 5),
      (timer) {
        if (!chatService.isJoined) {
          // Attempt to rejoin
          print('Attempting to reconnect to global chat...');
          // Implement reconnection logic
        }
      },
    );
  }

  void stop() {
    _reconnectionTimer?.cancel();
  }
}
```

## Complete Example

### Main App Setup

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/chat_provider.dart';
import 'screens/global_chat_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: MaterialApp(
        title: 'FlippX Global Chat',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          visualDensity: VisualDensity.adaptivePlatformDensity,
        ),
        home: const HomeScreen(),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('FlippX'),
      ),
      body: Center(
        child: ElevatedButton(
          onPressed: () {
            // Replace with actual JWT token from your auth system
            const jwtToken = 'your-jwt-token-here';
            
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => const GlobalChatScreen(
                  jwtToken: jwtToken,
                ),
              ),
            );
          },
          child: const Text('Open Global Chat'),
        ),
      ),
    );
  }
}
```

## Testing

### Test Socket Connection

```dart
void testSocketConnection() async {
  final chatService = GlobalChatService();
  
  // Test connection
  await chatService.joinGlobalChat('your-test-token');
  
  // Test sending message
  chatService.sendTextMessage('Hello World!');
  
  // Test typing indicator
  chatService.startTyping();
  await Future.delayed(const Duration(seconds: 2));
  chatService.stopTyping();
  
  // Cleanup
  chatService.leaveGlobalChat();
  chatService.dispose();
}
```

## Troubleshooting

### Common Issues

1. **Socket not connecting**
   - Verify server URL is correct
   - Check JWT token is valid
   - Ensure CORS is configured on server

2. **Messages not appearing**
   - Check socket connection status
   - Verify event listeners are set up
   - Check for console errors

3. **Typing indicators not working**
   - Ensure you're calling startTyping/stopTyping
   - Check network connection
   - Verify socket is connected

## Performance Tips

1. **Limit message history**: Only load recent messages initially
2. **Lazy loading**: Implement pagination for older messages
3. **Dispose streams**: Always dispose StreamControllers when done
4. **Debounce typing**: Add debounce to typing indicators on client side
5. **Cache media**: Use `cached_network_image` for images

## Security Notes

1. Always validate JWT token before connecting
2. Never store sensitive data in messages
3. Sanitize user input before displaying
4. Implement rate limiting on client side
5. Handle expired tokens gracefully

---

**Need Help?** Contact the FlippX development team for support.

