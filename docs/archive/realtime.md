# Real-time Features

## Overview

The Expense Tracker includes Socket.IO integration for real-time functionality, enabling live updates and notifications.

## Socket.IO Integration

### Server Setup
Socket.IO is configured in `backend/src/sockets/index.ts`:
```typescript
export const setupSocketIO = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    // Handle authentication and room joining
  });

  return io;
};
```

### Client Connection
Frontend connects to Socket.IO using environment variables:
```typescript
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  autoConnect: true,
});
```

## Real-time Features

### Live Notifications
- Expense updates
- Budget threshold alerts
- Account balance changes

### Live Dashboard Updates
- Real-time expense charts
- Instant balance updates
- Category spending updates

### Multi-device Sync
- Changes sync across devices
- Real-time user presence
- Live collaboration features

## Event System

### Server Events
```typescript
// Emit to specific user
io.to(userId).emit('expense:updated', expenseData);

// Emit to all connected clients
io.emit('system:status', statusData);

// Broadcast to room
io.to(roomName).emit('room:activity', activityData);
```

### Client Events
```typescript
// Listen for expense updates
socket.on('expense:updated', (data) => {
  updateExpenseInUI(data);
});

// Listen for notifications
socket.on('notification', (notification) => {
  showNotification(notification);
});
```

## Authentication

### JWT Integration
Socket connections are authenticated using JWT tokens:
```typescript
// Client sends token
socket.auth = { token: getAuthToken() };

// Server verifies token
io.use(async (socket, next) => {
  try {
    const payload = await verifyToken(socket.handshake.auth.token);
    socket.userId = payload.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});
```

### Room Management
Users join rooms based on their data access:
```typescript
// Join user-specific room
socket.join(`user:${userId}`);

// Join shared expense room
socket.join(`expense:${expenseId}`);
```

## Performance Considerations

### Connection Management
- Automatic reconnection
- Connection pooling
- Heartbeat monitoring

### Message Optimization
- Compress large payloads
- Debounce rapid updates
- Batch multiple changes

### Scalability
- Horizontal scaling with Redis adapter
- Load balancing support
- Connection limits per user

## Error Handling

### Connection Errors
```typescript
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  // Show user-friendly error message
});
```

### Reconnection Strategy
```typescript
socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
  // Sync any missed updates
});
```

## Development

### Testing
```typescript
// Test socket events
describe('Socket Events', () => {
  it('should emit expense updates', (done) => {
    socket.emit('expense:create', testData);
    socket.on('expense:created', (data) => {
      expect(data).toMatchObject(testData);
      done();
    });
  });
});
```

### Debugging
```typescript
// Enable debug logging
localStorage.debug = 'socket.io-client:*';
```

## Production Considerations

### Security
- Rate limiting on events
- Input validation
- CORS configuration
- SSL/TLS encryption

### Monitoring
- Connection metrics
- Event frequency
- Error tracking
- Performance monitoring

### Scaling
- Redis adapter for multi-instance
- Load balancer configuration
- Connection limits
- Resource monitoring