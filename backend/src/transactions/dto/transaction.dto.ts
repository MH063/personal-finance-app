import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  Max,
  MaxLength,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TransactionType, PaymentMethod } from '../../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty({ example: 150.5, description: '交易金额（精确到分）' })
  @IsNumber()
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE, description: '交易类型' })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ description: '分类ID' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: '午餐消费', description: '交易描述' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, description: '支付方式' })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: '麦当劳', description: '商户名称' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  merchant?: string;

  @ApiProperty({ example: '2025-01-08T12:00:00Z', description: '交易日期' })
  @IsDateString()
  transactionDate: string;

  @ApiPropertyOptional({ description: '附加元数据' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: '账本ID' })
  @IsUUID()
  @IsOptional()
  ledgerId?: string;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({ example: 200.0 })
  @IsNumber()
  @Min(0.01)
  @Max(9999999999.99)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: '账本ID' })
  @IsUUID()
  @IsOptional()
  ledgerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  merchant?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: '最小金额' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @ApiPropertyOptional({ description: '最大金额' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxAmount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: '账本ID' })
  @IsUUID()
  @IsOptional()
  ledgerId?: string;

  @ApiPropertyOptional({ description: '排序字段', default: 'transactionDate' })
  @IsString()
  @IsOptional()
  sortBy?: string = 'transactionDate';

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'], default: 'desc' })
  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class BatchDeleteDto {
  @ApiProperty({ description: '交易ID列表' })
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BatchUpdateCategoryDto {
  @ApiProperty({ description: '要更新分类的交易ID列表' })
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ description: '新的分类ID' })
  @IsUUID()
  categoryId: string;
}

export class ImportTransactionsDto {
  @ApiPropertyOptional({ description: '导入后是否覆盖已有数据', default: false })
  @IsOptional()
  overwrite?: boolean;
}
