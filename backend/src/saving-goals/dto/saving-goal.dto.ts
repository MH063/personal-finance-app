import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  IsBoolean,
  IsInt,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSavingGoalDto {
  @ApiProperty({ description: '目标名称' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: '目标描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '目标金额' })
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @ApiPropertyOptional({ description: '当前金额' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  currentAmount?: number;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiPropertyOptional({ description: '币种' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: '是否自动划转' })
  @IsBoolean()
  @IsOptional()
  autoTransfer?: boolean;

  @ApiPropertyOptional({ description: '自动划转金额' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  autoTransferAmount?: number;

  @ApiPropertyOptional({ description: '自动划转日(1-31)' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  autoTransferDay?: number;
}

export class UpdateSavingGoalDto {
  @ApiPropertyOptional({ description: '目标名称' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '目标描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '目标金额' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  targetAmount?: number;

  @ApiPropertyOptional({ description: '当前金额' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  currentAmount?: number;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsEnum(['active', 'completed', 'abandoned'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: '是否自动划转' })
  @IsBoolean()
  @IsOptional()
  autoTransfer?: boolean;

  @ApiPropertyOptional({ description: '自动划转金额' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  autoTransferAmount?: number;

  @ApiPropertyOptional({ description: '自动划转日(1-31)' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  autoTransferDay?: number;
}
