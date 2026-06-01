import { io, Socket } from 'socket.io-client';
import { TokenManager } from './api';

interface SocketEvents {
  // Sync events
  sync_response: (data: {
    success: boolean;
    data?: any;
    error?: string;
    timestamp: string;
  }) => void;

  // Data update events
  transaction_updated: (data: {
    transaction: any;
    timestamp: string;
  }) => void;

  transaction_saved: (data: {
    success: boolean;
    transaction?: any;
    error?: string;
  }) => void;

  account_updated: (data: {
    account: any;
    timestamp: string;
  }) => void;

  account_saved: (data: {
    success: boolean;
    account?: any;
    error?: string;
  }) => void;

  goal_updated: (data: {
    goal: any;
    timestamp: string;
  }) => void;

  goal_saved: (data: {
    success: boolean;
    goal?: any;
    error?: string;
  }) => void;

  // Booking events
  booking_notification: (data: {
    success: boolean;
    booking?: any;
    error?: string;
    message?: string;
  }) => void;

  booking_status_changed: (data: {
    booking: any;
    timestamp: string;
  }) => void;

  booking_status_updated: (data: {
    success: boolean;
    booking?: any;
    error?: string;
  }) => void;

  // Payment events
  payment_status_changed: (data: {
    payment: any;
    timestamp: string;
  }) => void;

  payment_received: (data: {
    payment: any;
    timestamp: string;
  }) => void;

  payment_status_updated: (data: {
    success: boolean;
    payment?: any;
    error?: string;
  }) => void;

  // Chat events
  new_message: (data: {
    message: any;
    timestamp: string;
  }) => void;

  message_sent: (data: {
    success: boolean;
    message?: any;
    error?: string;
  }) => void;

  // Connection events
  connect: () => void;
  disconnect: () => void;
  error: (error: any) => void;

  // Admin events
  feature_flags_updated: (data: {
    type: 'global' | 'ai';
    timestamp: string;
  }) => void;
}

interface EmitEvents {
  // Sync events
  sync_request: (data: {
    lastSyncedAt?: string;
    entityTypes?: string[];
  }) => void;

  // Data update events
  transaction_update: (data: {
    transaction: any;
  }) => void;

  account_update: (data: {
    account: any;
  }) => void;

  goal_update: (data: {
    goal: any;
  }) => void;

  // Booking events
  booking_request: (data: {
    bookingId: string;
    message?: string;
  }) => void;

  booking_status_update: (data: {
    bookingId: string;
    status: string;
    rejectionReason?: string;
  }) => void;

  // Payment events
  payment_status_update: (data: {
    paymentId: string;
    status: string;
  }) => void;

  // Chat events
  chat_message: (data: {
    sessionId: string;
    message: string;
  }) => void;
}

class SocketClient {
  private socket: Socket<SocketEvents, EmitEvents> | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.setupReconnectionLogic();
  }

  private resolveSocketUrl(): string {
    const configuredSocketUrl = (import.meta.env.VITE_SOCKET_URL || '').trim().replace(/\/+$/, '');
    if (configuredSocketUrl) {
      return configuredSocketUrl;
    }

    const apiBase = (import.meta.env.VITE_API_URL || '').trim();
    if (!apiBase || apiBase.startsWith('/')) {
      return window.location.origin;
    }

    return apiBase.replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(token: string, deviceId: string): Promise<void> {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Clean up any existing socket/connection first to prevent memory and connection leaks
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (err) {
        // Ignore
      }
      this.socket = null;
    }

    try {
      const socketUrl = this.resolveSocketUrl();
      
      // Vercel serverless environment detection: WebSockets are not supported.
      // Gracefully disable connection to prevent console noise, errors, and performance overhead.
      if (socketUrl.includes('vercel.app') || window.location.hostname.endsWith('vercel.app')) {
        console.log('[SocketClient] WebSockets are disabled in Vercel serverless environments. Falling back to HTTP polling.');
        this.isConnected = false;
        return;
      }

      this.socket = io(socketUrl, {
        auth: {
          token,
          deviceId
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: false // Disable built-in reconnection to avoid conflicting with custom reconnect loop
      });

      this.setupEventListeners();
      this.setupErrorHandlers();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          console.log('Socket connected successfully');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          cleanup();
          resolve();
        };

        const onConnectError = (error: any) => {
          console.error('Socket connection error:', error);
          this.isConnected = false;
          cleanup();
          reject(error);
        };

        const cleanup = () => {
          this.socket?.off('connect', onConnect);
          this.socket?.off('connect_error', onConnectError);
        };

        this.socket!.on('connect', onConnect);
        this.socket!.on('connect_error', onConnectError);
      });

    } catch (error) {
      console.error('Failed to connect socket:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      console.log('Socket disconnected');
    }
  }

  /**
   * Check if socket is connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Request sync from server
   */
  requestSync(lastSyncedAt?: string, entityTypes?: string[]): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot request sync');
      return;
    }

    this.socket!.emit('sync_request', {
      lastSyncedAt,
      entityTypes
    });
  }

  /**
   * Update transaction via WebSocket
   */
  updateTransaction(transaction: any): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot update transaction');
      return;
    }

    this.socket!.emit('transaction_update', {
      transaction
    });
  }

  /**
   * Update account via WebSocket
   */
  updateAccount(account: any): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot update account');
      return;
    }

    this.socket!.emit('account_update', {
      account
    });
  }

  /**
   * Update goal via WebSocket
   */
  updateGoal(goal: any): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot update goal');
      return;
    }

    this.socket!.emit('goal_update', {
      goal
    });
  }

  /**
   * Request booking via WebSocket
   */
  requestBooking(bookingId: string, message?: string): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot request booking');
      return;
    }

    this.socket!.emit('booking_request', {
      bookingId,
      message
    });
  }

  /**
   * Update booking status via WebSocket
   */
  updateBookingStatus(bookingId: string, status: string, rejectionReason?: string): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot update booking status');
      return;
    }

    this.socket!.emit('booking_status_update', {
      bookingId,
      status,
      rejectionReason
    });
  }

  /**
   * Update payment status via WebSocket
   */
  updatePaymentStatus(paymentId: string, status: string): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot update payment status');
      return;
    }

    this.socket!.emit('payment_status_update', {
      paymentId,
      status
    });
  }

  /**
   * Send chat message via WebSocket
   */
  sendChatMessage(sessionId: string, message: string): void {
    if (!this.isConnectedToServer()) {
      console.warn('Socket not connected, cannot send chat message');
      return;
    }

    this.socket!.emit('chat_message', {
      sessionId,
      message
    });
  }

  /**
   * Subscribe to events
   */
  on<T extends keyof SocketEvents>(event: T, callback: SocketEvents[T]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event)!.push(callback);

    // Only manage typed callbacks internally; do not register with socket.io-client

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Unsubscribe from events
   */
  off<T extends keyof SocketEvents>(event: T, callback: SocketEvents[T]): void {
    // Remove from our listeners map
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }

    // Only manage typed callbacks internally; do not unregister from socket.io-client
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Sync events
    this.socket.on('sync_response', (data) => {
      this.emit('sync_response', data);
    });

    // Data update events
    this.socket.on('transaction_updated', (data) => {
      this.emit('transaction_updated', data);
    });

    this.socket.on('transaction_saved', (data) => {
      this.emit('transaction_saved', data);
    });

    this.socket.on('account_updated', (data) => {
      this.emit('account_updated', data);
    });

    this.socket.on('account_saved', (data) => {
      this.emit('account_saved', data);
    });

    this.socket.on('goal_updated', (data) => {
      this.emit('goal_updated', data);
    });

    this.socket.on('goal_saved', (data) => {
      this.emit('goal_saved', data);
    });

    // Booking events
    this.socket.on('booking_notification', (data) => {
      this.emit('booking_notification', data);
    });

    this.socket.on('booking_status_changed', (data) => {
      this.emit('booking_status_changed', data);
    });

    this.socket.on('booking_status_updated', (data) => {
      this.emit('booking_status_updated', data);
    });

    // Payment events
    this.socket.on('payment_status_changed', (data) => {
      this.emit('payment_status_changed', data);
    });

    this.socket.on('payment_received', (data) => {
      this.emit('payment_received', data);
    });

    this.socket.on('payment_status_updated', (data) => {
      this.emit('payment_status_updated', data);
    });

    // Chat events
    this.socket.on('new_message', (data) => {
      this.emit('new_message', data);
    });

    this.socket.on('message_sent', (data) => {
      this.emit('message_sent', data);
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.emit('connect', undefined);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.isConnected = false;
      this.emit('disconnect', undefined);
    });

    // Admin feature flag events
    this.socket.on('feature_flags_updated' as any, (data: any) => {
      this.emit('feature_flags_updated', data);
    });
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.isConnected = false;
      this.emit('error', error);
      this.handleReconnection();
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Setup reconnection logic
   */
  private setupReconnectionLogic(): void {
    // Listen for visibility change to reconnect when tab becomes active
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.isConnectedToServer()) {
        console.log('Tab became visible, attempting to reconnect...');
        // Reconnection will be handled by the error handler
      }
    });
  }

  /**
   * Handle reconnection attempts
   */
  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

    setTimeout(() => {
      if (!this.isConnectedToServer()) {
        // Try to reconnect
        this.reconnect();
      }
    }, delay);
  }

  /**
   * Attempt to reconnect
   */
  private async reconnect(): Promise<void> {
    try {
      // Get current auth info
      const token = TokenManager.getAccessToken();
      const deviceId = localStorage.getItem('device_id');

      if (token && deviceId) {
        await this.connect(token, deviceId);
      } else {
        console.warn('No auth token or device ID found for reconnection');
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      // DO NOT call this.handleReconnection() here as it is already triggered by the connect_error listener in setupErrorHandlers
    }
  }

  /**
   * Emit event to listeners
   */
  private emit<T extends keyof SocketEvents>(event: T, data: Parameters<SocketEvents[T]>[0]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          (callback as Function)(data);
        } catch (error) {
          console.error(`Error in socket event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Export singleton
export const socketClient = new SocketClient();
export default socketClient;
