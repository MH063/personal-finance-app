import { Controller, Get, Query, UseGuards, Post, Request, HttpCode, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BatchPredictDto } from './dto/ai.dto';

@ApiTags('智能分析')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @ApiOperation({ summary: '根据描述预测交易分类' })
  @Get('predict-category')
  /**
   * 根据交易描述预测分类，响应统一为{success,data}
   */
  async predictCategory(@Query('description') description: string) {
    const categoryId = await this.aiService.predictCategory(description);
    return { success: true, data: { categoryId } };
  }

  @ApiOperation({ summary: '批量预测交易分类' })
  @Post('batch-predict-category')
  @HttpCode(200)
  /**
   * 批量预测交易分类，响应统一为{success,data}
   */
  async batchPredictCategory(@Body() dto: BatchPredictDto) {
    const categoryIds = await this.aiService.batchPredictCategory(dto.descriptions);
    return { success: true, data: { categoryIds } };
  }

  @ApiOperation({ summary: '获取智能财务健康分析' })
  @Get('health-analysis')
  /**
   * 获取智能财务健康分析，响应统一为{success,data}
   */
  async getHealthAnalysis(@Request() req: any) {
    const data = await this.aiService.getHealthAnalysis(req.user.id);
    return { success: true, data };
  }

  @ApiOperation({ summary: '获取 AI 服务状态' })
  @Get('status')
  /**
   * 获取AI服务状态，响应统一为{success,data}
   */
  async getStatus() {
    const data = this.aiService.getServiceStatus();
    return { success: true, data };
  }

  @ApiOperation({ summary: '获取未来支出预测' })
  @Get('forecast')
  /**
   * 获取未来支出预测数据，响应统一为{success,data}
   */
  async getForecast(@Request() req: any) {
    const data = await this.aiService.getForecast(req.user.id);
    return { success: true, data };
  }

  @ApiOperation({ summary: '手动触发 AI 重新训练' })
  @Post('retrain')
  @HttpCode(200)
  /**
   * 手动触发AI重新训练，响应统一为{success,data}
   */
  async retrain() {
    await this.aiService.trainClassifier();
    return { success: true, data: { message: 'AI 训练已启动' } };
  }

  @ApiOperation({ summary: '自然语言查账 (NLQ)' })
  @Post('query')
  @HttpCode(200)
  /**
   * 自然语言查账，统一包装为{success,data}；失败时返回{success:false,message,reason}
   */
  async query(
    @Body() body: { query: string; page?: number; limit?: number; fast?: boolean },
    @Request() req: any,
  ) {
    const page = typeof body.page === 'number' && body.page > 0 ? body.page : 1;
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 50;
    const fastMode = !!body.fast;
    const res = await this.aiService.naturalLanguageQuery(body.query, req.user.id, {
      page,
      limit,
      fastMode,
    });
    if (res && res.success) {
      return { success: true, data: { answer: res.answer, debug: res.debug } };
    }
    return {
      success: false,
      message: res?.message || '查询失败',
      reason: res?.reason || 'UNKNOWN',
      data: res?.debug ? { debug: res.debug } : undefined,
    };
  }
}
