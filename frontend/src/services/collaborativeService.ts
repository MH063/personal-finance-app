import { io, Socket } from 'socket.io-client';

/**
 * 实时协作服务
 * 处理 Socket.io 连接和事件
 */
class CollaborativeService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private lastSyncTime: Date | null = null;
  private connectionErrors: string[] = [];
  private isInitializing: boolean = false;

  /**
   * 初始化 Socket 连接
   */
  init(token: string) {
    if (this.socket?.connected) {
      console.log('[Socket] 已经连接，跳过初始化');
      return;
    }
    
    if (this.isInitializing) {
      console.log('[Socket] 正在初始化中，跳过重复调用');
      return;
    }

    this.isInitializing = true;
    
    if (this.socket) {
      console.log('[Socket] 断开旧连接');
      this.socket.disconnect();
    }

    // 根据当前页面的 hostname 动态生成 Socket 地址
    const hostname = window.location.hostname;
    // 强制使用本机网卡 IP 而非 localhost，防止代理软件拦截
    const socketUrl = `http://${hostname}:4000/ledgers`;
    
    console.log(`[Socket] 正在初始化连接: ${socketUrl}`);

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'], // 允许轮询降级以提高成功率
      reconnection: true,
      reconnectionAttempts: 5, // 限制重连次数，防止无限循环
      reconnectionDelay: 2000,
      timeout: 10000,
      forceNew: true // 强制创建新连接
    });

    this.socket.on('connect', () => {
      this.isInitializing = false;
      console.log('✅ 实时同步连接成功, 客户端ID:', this.socket?.id || 'N/A');
      this.lastSyncTime = new Date();
      this.notifyListeners('connect', { socketId: this.socket?.id });
      // 连接成功后，触发一次全局更新，以进行数据补偿（同步断网期间的变化）
      this.notifyListeners('globalUpdate', { type: 'RECONNECTED_SYNC', timestamp: this.lastSyncTime });
    });

    this.socket.on('connect_error', (error) => {
      this.isInitializing = false;
      console.error('❌ 实时同步连接错误:', error.message);
      const errorMsg = `连接错误: ${error.message}`;
      this.connectionErrors.push(`${new Date().toLocaleTimeString()}: ${errorMsg}`);
      if (this.connectionErrors.length > 10) this.connectionErrors.shift();
      this.notifyListeners('disconnect', { error: error.message });
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket 错误:', error);
      this.notifyListeners('error', error);
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] 正在尝试第 ${attempt} 次重连...`);
    });

    this.socket.on('reconnect', (attempt) => {
      console.log(`[Socket] 重连成功 (尝试次数: ${attempt})`);
      this.lastSyncTime = new Date();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] 已断开协作服务器连接, 原因:', reason);
      this.notifyListeners('disconnect', { reason });
      if (reason === 'io server disconnect') {
        this.socket?.connect();
      }
    });

    this.socket.on('ledgerUpdate', (data) => {
      console.log('[Socket] 收到账本更新通知:', data);
      this.lastSyncTime = new Date();
      this.notifyListeners('ledgerUpdate', data);
    });

    this.socket.on('globalUpdate', (data) => {
      console.log('[Socket] 收到全局更新通知:', data);
      this.lastSyncTime = new Date();
      this.notifyListeners('globalUpdate', data);
    });

    this.socket.on('settingsUpdate', (data) => {
      console.log('[Socket] 收到设置更新通知:', data);
      this.lastSyncTime = new Date();
      this.notifyListeners('settingsUpdate', data);
    });

    this.socket.on('userJoined', (data) => {
      console.log('[Socket] 用户加入房间:', data);
      this.notifyListeners('userJoined', data);
    });

    this.socket.on('userLeft', (data) => {
      console.log('[Socket] 用户离开房间:', data);
      this.notifyListeners('userLeft', data);
    });
  }

  /**
   * 获取同步状态信息
   */
  getSyncInfo() {
    return {
      isConnected: this.socket?.connected || false,
      lastSyncTime: this.lastSyncTime,
      errors: [...this.connectionErrors],
      socketId: this.socket?.id
    };
  }

  /**
   * 手动触发强制同步
   */
  async forceSync() {
    console.log('[Socket] 触发手动强制同步');
    
    // 1. 如果 Socket 断开了，尝试重新连接
    if (!this.socket?.connected) {
      console.log('[Socket] 连接已断开，尝试重新初始化...');
      const token = localStorage.getItem('accessToken');
      if (token) {
        this.init(token);
      }
    }
    
    // 2. 先触发一次离线队列的强制同步
    try {
      const { offlineSyncService } = await import('./offlineSyncService');
      await offlineSyncService.syncPendingChanges();
    } catch (err) {
      console.error('[Socket] 离线同步失败:', err);
    }
    
    // 3. 通知 UI 正在同步
    this.notifyListeners('connect', {}); 
    
    // 4. 广播手动刷新事件
    this.notifyListeners('globalUpdate', { 
      type: 'MANUAL_FORCE_SYNC', 
      timestamp: new Date(),
      status: 'success'
    });
  }

  /**
   * 加入账本房间
   */
  joinLedger(ledgerId: string) {
    if (!this.socket) return;
    this.socket.emit('joinLedger', ledgerId);
  }

  /**
   * 离开账本房间
   */
  leaveLedger(ledgerId: string) {
    if (!this.socket) return;
    this.socket.emit('leaveLedger', ledgerId);
  }

  /**
   * 注册事件监听器
   */
  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback: (data: any) => void) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  /**
   * 触发本地事件通知
   */
  emit(event: string, data: any) {
    this.notifyListeners(event, data);
    
    // 如果连接了 Socket，也将事件同步到服务器（如果需要）
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  /**
   * 通知本地监听器
   */
  private notifyListeners(event: string, data: any) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(callback => callback(data));
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const collaborativeService = new CollaborativeService();
