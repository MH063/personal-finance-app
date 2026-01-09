import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TransactionType } from '../../entities/transaction.entity';

export enum TimeRange {
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  AREA = 'area',
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
}

export class StatisticsQueryDto {
  @ApiPropertyOptional({ enum: TimeRange, default: TimeRange.MONTH })
  @IsEnum(TimeRange)
  @IsOptional()
  timeRange?: TimeRange = TimeRange.MONTH;

  @ApiPropertyOptional({ description: '开始日期（当timeRange=custom时必需）' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期（当timeRange=custom时必需）' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  categoryId?: string;
}

export class ChartQueryDto {
  @ApiPropertyOptional({ enum: ChartType, default: ChartType.LINE })
  @IsEnum(ChartType)
  @IsOptional()
  chartType?: ChartType = ChartType.LINE;

  @ApiPropertyOptional({ enum: TimeRange, default: TimeRange.MONTH })
  @IsEnum(TimeRange)
  @IsOptional()
  timeRange?: TimeRange = TimeRange.MONTH;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  categoryId?: string;
}

export class HealthQueryDto {
  @ApiPropertyOptional({ enum: ['month', 'quarter', 'year'], default: 'month' })
  @IsString()
  @IsOptional()
  period?: string = 'month';
}

export class ExportReportDto {
  @ApiProperty({ enum: ReportFormat })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiPropertyOptional({ enum: ['summary', 'detailed', 'category'] })
  @IsString()
  @IsOptional()
  reportType?: string = 'summary';

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expense: number;
  netIncome: number;
  transactionCount: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  trend: number;
}

export interface OverviewData {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  averageDaily: number;
  categoryBreakdown: CategoryBreakdown[];
  monthlyTrends: MonthlyTrend[];
}

export interface FinancialHealth {
  savingsRate: number;
  expenseRatio: number;
  incomeGrowth: number;
  expenseGrowth: number;
  healthScore: number;
  healthLevel: string;
  recommendations: string[];
}
