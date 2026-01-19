import { Controller, Get, Query, Res, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { Response } from 'express';

@ApiTags('报表')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('pdf')
  @ApiOperation({ summary: '导出 PDF 报表' })
  async exportPdf(
    @Request() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('ledgerId') ledgerId: string,
    @Res() res: Response,
  ) {
    return this.reportsService.generatePdfReport(req.user.id, ledgerId, startDate, endDate, res);
  }
}
