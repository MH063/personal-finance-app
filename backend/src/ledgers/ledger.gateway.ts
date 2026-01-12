import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 账本实时协作网关
 * 处理多用户同时编辑账本时的实时更新
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'ledgers',
})
export class LedgerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LedgerGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * 处理连接
   */
  async handleConnection(client: Socket) {
    this.logger.log(`正在尝试建立连接: ${client.id}`);
    try {
      const token = client.handshake.auth.token || client.handshake.query.token;
      if (!token) {
        this.logger.warn(`未授权的连接尝试: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      this.logger.log(`用户已连接: ${payload.username} (${client.id})`);

      // 自动加入用户的个人房间，用于接收个人相关的实时更新
      const userId = payload.sub || payload.id;
      if (userId) {
        client.join(`user_${userId}`);
        this.logger.log(`用户 ${payload.username} 已加入个人房间: user_${userId}`);
      }
    } catch (error) {
      this.logger.error(`连接鉴权失败: ${client.id}`);
      client.disconnect();
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`用户已断开: ${client.id}`);
  }

  /**
   * 加入账本房间
   */
  @SubscribeMessage('joinLedger')
  handleJoinLedger(
    @ConnectedSocket() client: Socket,
    @MessageBody() ledgerId: string,
  ) {
    client.join(`ledger_${ledgerId}`);
    this.logger.log(`用户 ${client.data.user?.username} 加入了账本房间: ${ledgerId}`);
    
    // 通知房间内其他成员有人加入
    client.to(`ledger_${ledgerId}`).emit('userJoined', {
      userId: client.data.user?.sub,
      username: client.data.user?.username,
    });
    
    return { event: 'joined', data: ledgerId };
  }

  /**
   * 离开账本房间
   */
  @SubscribeMessage('leaveLedger')
  handleLeaveLedger(
    @ConnectedSocket() client: Socket,
    @MessageBody() ledgerId: string,
  ) {
    client.leave(`ledger_${ledgerId}`);
    this.logger.log(`用户 ${client.data.user?.username} 离开了账本房间: ${ledgerId}`);
    
    // 通知房间内其他成员有人离开
    client.to(`ledger_${ledgerId}`).emit('userLeft', {
      userId: client.data.user?.sub,
      username: client.data.user?.username,
    });
    
    return { event: 'left', data: ledgerId };
  }

  /**
   * 发送更新通知
   * 由 Service 在数据变更时调用
   */
  notifyUpdate(ledgerId: string | null, type: string, data: any, userId?: string) {
    const payload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`[RealTime] 推送更新通知: type=${type}, userId=${userId || 'all'}, ledgerId=${ledgerId || 'none'}`);

    // 发送到账本房间
    if (ledgerId) {
      this.server.to(`ledger_${ledgerId}`).emit('ledgerUpdate', payload);
    }

    // 同时发送到用户的个人房间，确保统计数据能实时更新
    if (userId) {
      this.server.to(`user_${userId}`).emit('ledgerUpdate', payload);
      // 同时也触发全局更新通知，方便页面刷新所有数据
      this.server.to(`user_${userId}`).emit('globalUpdate', payload);
    }

    // 如果没有指定用户或账本，广播给所有人（慎用）
    if (!ledgerId && !userId) {
      this.server.emit('globalUpdate', payload);
    }
  }

  /**
   * 推送设置更新
   */
  notifySettingsUpdate(userId: string, data: any) {
    this.logger.log(`[RealTime] 推送设置更新: userId=${userId}`);
    this.server.to(`user_${userId}`).emit('settingsUpdate', {
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
