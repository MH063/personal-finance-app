import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
import {
  DebtType,
  DebtStatus,
  RepaymentType,
  RepaymentDayAdjustment,
} from '../../entities/debt.entity';
import { PaymentStatus } from '../../entities/debt-payment.entity';
import { PaymentMethod } from '../../entities/transaction.entity';

export class CreateDebtDto {
  @ApiPropertyOptional({
    example: 'a99b5cb7-7944-40fb-b2c2-a9df9c34e49c',
    description: '债务ID（可选，离线同步时使用）',
  })
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

  @ApiProperty({ example: '2025-01-01', description: '借款日期' })
  @IsDateString()
  loanDate: string;

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

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: '支付方式',
    default: PaymentMethod.OTHER,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: RepaymentType,
    example: RepaymentType.EQUAL_LOAN_PAYMENTS,
    description: '还款方式',
    default: RepaymentType.CUSTOM,
  })
  @IsEnum(RepaymentType)
  @IsOptional()
  repaymentType?: RepaymentType;

  @ApiPropertyOptional({ example: 15, description: '每月还款日 (1-31)' })
  @IsNumber()
  @Min(1)
  @Max(31)
  @IsOptional()
  repaymentDay?: number;

  @ApiPropertyOptional({
    enum: RepaymentDayAdjustment,
    example: RepaymentDayAdjustment.NONE,
    description: '非工作日调整策略',
    default: RepaymentDayAdjustment.NONE,
  })
  @IsEnum(RepaymentDayAdjustment)
  @IsOptional()
  repaymentDayAdjustment?: RepaymentDayAdjustment;

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

  @ApiPropertyOptional({ example: 10000, description: '原始金额' })
  @IsNumber()
  @Min(0.01)
  @Max(999999999999.99)
  @IsOptional()
  originalAmount?: number;

  @ApiPropertyOptional({ example: '2025-01-01', description: '借款日期' })
  @IsDateString()
  @IsOptional()
  loanDate?: string;

  @ApiPropertyOptional({ example: 8000 })
  @IsNumber()
  @Min(0)
  @Max(999999999999999)
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

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: '支付方式',
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: RepaymentType,
    description: '还款方式',
  })
  @IsEnum(RepaymentType)
  @IsOptional()
  repaymentType?: RepaymentType;

  @ApiPropertyOptional({ description: '每月还款日 (1-31)' })
  @IsNumber()
  @Min(1)
  @Max(31)
  @IsOptional()
  repaymentDay?: number;

  @ApiPropertyOptional({
    enum: RepaymentDayAdjustment,
    description: '非工作日调整策略',
  })
  @IsEnum(RepaymentDayAdjustment)
  @IsOptional()
  repaymentDayAdjustment?: RepaymentDayAdjustment;

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

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: '支付方式',
    default: PaymentMethod.OTHER,
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: '还款状态',
    default: PaymentStatus.CONFIRMED,
  })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;
}

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}

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
