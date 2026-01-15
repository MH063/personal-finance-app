import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import {
  StatisticsQueryDto,
  ChartQueryDto,
  HealthQueryDto,
  ExportReportDto,
} from './dto/statistics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('统计')
@Controller('statistics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取财务概览数据' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getOverview(@Request() req: any, @Query() query: StatisticsQueryDto) {
    return this.statisticsService.getOverview(req.user.id, query);
  }

  @Get('charts')
  @ApiOperation({ summary: '获取图表数据' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getCharts(@Request() req: any, @Query() query: ChartQueryDto) {
    return this.statisticsService.getChartData(req.user.id, query);
  }

  @Get('health')
  @ApiOperation({ summary: '获取财务健康指标' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getHealth(@Request() req: any, @Query() query: HealthQueryDto) {
    return this.statisticsService.getFinancialHealth(req.user.id, query.period);
  }

  @Get('debts')
  @ApiOperation({ summary: '获取债务概览' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getDebtOverview(@Request() req: any) {
    return this.statisticsService.getDebtOverview(req.user.id);
  }

  @Get('export')
  @ApiOperation({ summary: '导出报表' })
  @ApiResponse({ status: 200, description: '导出成功' })
  async exportReport(@Request() req: any, @Query() query: ExportReportDto, @Res() res: Response) {
    try {
      if (query.format === 'excel') {
        const buffer = await this.statisticsService.exportOverviewExcel(req.user.id, query as any);
        const filename = `财务报表_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(filename)}"`,
        );
        res.status(200).send(buffer);
        return;
      }
      // TODO: 其他格式可以后续支持
      res.status(400).json({ success: false, message: '暂不支持该导出格式' });
    } catch (error) {
      res.status(500).json({ success: false, message: '导出失败', error: String(error) });
    }
  }
}
