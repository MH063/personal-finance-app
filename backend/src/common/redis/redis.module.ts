import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');
        const db = configService.get<number>('REDIS_DB', 0);

        return new Redis({
          host,
          port,
          password,
          db,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 100, 2000);
            return delay;
          },
          // 启用连接池管理（ioredis 默认即为连接池模式）
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_SERVICE',
      useFactory: (redisClient: Redis) => {
        return redisClient;
      },
      inject: ['REDIS_CLIENT'],
    },
  ],
  exports: ['REDIS_CLIENT', 'REDIS_SERVICE'],
})
export class RedisModule {}
