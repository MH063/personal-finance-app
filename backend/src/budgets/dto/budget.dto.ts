import { IsUUID, IsNumber, IsDateString, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetStatus } from '../../entities/budget.entity';

export class CreateBudgetDto {
  @ApiProperty({ description: '分类ID' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ description: '预算金额', minimum: 0 })
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @ApiProperty({ description: '开始日期', example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '结束日期', example: '2024-01-31' })
  @IsDateString()
  endDate: string;
}

export class UpdateBudgetDto {
  @ApiPropertyOptional({ description: '预算金额', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  amount?: number;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '状态', enum: BudgetStatus })
  @IsOptional()
  @IsEnum(BudgetStatus)
  status?: BudgetStatus;

  @ApiPropertyOptional({ description: '版本号' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class BudgetResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  categoryId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty({ enum: BudgetStatus })
  status: BudgetStatus;

  @ApiPropertyOptional()
  usedAmount?: number;

  @ApiPropertyOptional()
  remainingAmount?: number;

  @ApiPropertyOptional()
  usagePercentage?: number;
}
