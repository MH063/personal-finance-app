import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import Redis from 'ioredis';

@ApiTags('系统')
@Controller()
export class AppController {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '系统健康检查' })
  @ApiResponse({ status: 200, description: '系统运行正常' })
  getHello(): any {
    return {
      success: true,
      message: '个人财务管理系统 API 运行正常',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Public()
  @Get('health/redis')
  @ApiOperation({ summary: 'Redis 健康检查' })
  async checkRedis() {
    try {
      const ping = await this.redis.ping();
      return {
        success: true,
        data: {
          status: 'UP',
          ping,
          info: {
            host: this.redis.options.host,
            port: this.redis.options.port,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        data: {
          status: 'DOWN',
          error: error.message,
        },
      };
    }
  }
}
