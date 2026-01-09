import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('系统')
@Controller()
export class AppController {
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
}
