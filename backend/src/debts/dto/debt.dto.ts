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
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DebtType, DebtStatus } from '../../entities/debt.entity';

export class CreateDebtDto {
  @ApiPropertyOptional({ example: 'a99b5cb7-7944-40fb-b2c2-a9df9c34e49c', description: '债务ID（可选，离线同步时使用）' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: '张三', description: '债务人名称' })
  @IsString()
  @MaxLength(100)
  debtorName: string;

  @ApiProperty({ example: 10000, description: '原始金额' })
  @IsNumber()
  @Min(0.01)
  @Max(999999999999.99)
  originalAmount: number;

  @ApiProperty({
    enum: DebtType,
    example: DebtType.BORROW,
    description: '债务类型：borrow（借入）、lend（借出）',
  })
  @IsEnum(DebtType)
  debtType: DebtType;

  @ApiPropertyOptional({ example: '2025-02-08', description: '约定还款日期' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 5, description: '利率（百分比）' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  interestRate?: number;

  @ApiPropertyOptional({ example: '朋友借款', description: '债务描述' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2025-01-15', description: '提醒日期' })
  @IsDateString()
  @IsOptional()
  reminderDate?: string;

  @ApiPropertyOptional({ description: '是否启用提醒', default: true })
  @IsBoolean()
  @IsOptional()
  isReminderEnabled?: boolean;
}

export class UpdateDebtDto {
  @ApiPropertyOptional({ example: '李四' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  debtorName?: string;

  @ApiPropertyOptional({ example: 8000 })
  @IsNumber()
  @Min(0)
  @Max(999999999999999.99)
  @IsOptional()
  remainingAmount?: number;

  @ApiPropertyOptional({ example: '2025-03-08' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ enum: DebtStatus })
  @IsEnum(DebtStatus)
  @IsOptional()
  status?: DebtStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  interestRate?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  reminderDate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isReminderEnabled?: boolean;

  @ApiPropertyOptional({ description: '版本号' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class CreatePaymentDto {
  @ApiProperty({ example: 1000, description: '本次还款金额' })
  @IsNumber()
  @Min(0.01)
  @Max(999999999999.99)
  amount: number;

  @ApiProperty({ example: '2025-01-10', description: '还款日期' })
  @IsDateString()
  paymentDate: string;

  @ApiPropertyOptional({ example: '部分还款', description: '备注' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  note?: string;
}

export class DebtQueryDto {
  @ApiPropertyOptional({ enum: DebtType })
  @IsEnum(DebtType)
  @IsOptional()
  debtType?: DebtType;

  @ApiPropertyOptional({ enum: DebtStatus })
  @IsEnum(DebtStatus)
  @IsOptional()
  status?: DebtStatus;

  @ApiPropertyOptional({ description: '是否只显示需要提醒的债务', default: false })
  @IsOptional()
  withReminder?: boolean = false;

  @ApiPropertyOptional({ description: '是否只显示逾期债务', default: false })
  @IsOptional()
  overdue?: boolean = false;
}

export class DebtStatisticsDto {
  @ApiPropertyOptional({ description: '是否包含已还清债务', default: false })
  @IsOptional()
  includePaid?: boolean = false;
}
