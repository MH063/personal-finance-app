import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Redis Socket.io 适配器
 * 用于在分布式环境下同步 Socket.io 消息，支持高并发和横向扩展
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  /**
   * 连接 Redis 并初始化适配器
   * @param redisClient ioredis 实例
   */
  async connectToRedis(redisClient: Redis): Promise<void> {
    const pubClient = redisClient;
    const subClient = pubClient.duplicate();

    await Promise.all([
      pubClient.connect().catch(() => {}), // 如果已经连接则忽略
      subClient.connect().catch(() => {}),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.io Redis 适配器已初始化');
  }

  /**
   * 创建基于 Redis 的 IO 服务器
   */
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
