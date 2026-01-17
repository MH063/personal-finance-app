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
  async predictCategory(@Query('description') description: string) {
    const categoryId = await this.aiService.predictCategory(description);
    return { categoryId };
  }

  @ApiOperation({ summary: '批量预测交易分类' })
  @Post('batch-predict-category')
  @HttpCode(200)
  async batchPredictCategory(@Body() dto: BatchPredictDto) {
    const categoryIds = await this.aiService.batchPredictCategory(dto.descriptions);
    return { categoryIds };
  }

  @ApiOperation({ summary: '获取智能财务健康分析' })
  @Get('health-analysis')
  async getHealthAnalysis(@Request() req: any) {
    return this.aiService.getHealthAnalysis(req.user.id);
  }

  @ApiOperation({ summary: '获取未来支出预测' })
  @Get('forecast')
  async getForecast(@Request() req: any) {
    return this.aiService.getForecast(req.user.id);
  }

  @ApiOperation({ summary: '手动触发 AI 重新训练' })
  @Post('retrain')
  @HttpCode(200)
  async retrain() {
    await this.aiService.trainClassifier();
    return { message: 'AI 训练已启动' };
  }
}
