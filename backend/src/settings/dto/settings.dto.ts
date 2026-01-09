import { IsEnum, IsString, IsOptional, IsBoolean, IsNumber, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ThemeMode, Currency } from '../../entities/user-setting.entity';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: ThemeMode, description: '主题模式' })
  @IsEnum(ThemeMode)
  @IsOptional()
  theme?: ThemeMode;

  @ApiPropertyOptional({ enum: Currency, description: '货币类型' })
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @ApiPropertyOptional({ description: '语言' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ description: '日期格式' })
  @IsString()
  @IsOptional()
  dateFormat?: string;

  @ApiPropertyOptional({ description: '一周的第一天 (0-6)' })
  @IsNumber()
  @IsOptional()
  firstDayOfWeek?: number;

  @ApiPropertyOptional({ description: '小数点位数' })
  @IsNumber()
  @IsOptional()
  decimalPlaces?: number;

  @ApiPropertyOptional({ description: '默认支付方式' })
  @IsString()
  @IsOptional()
  defaultPaymentMethod?: string;

  @ApiPropertyOptional({ description: '启用快速添加' })
  @IsBoolean()
  @IsOptional()
  quickAddEnabled?: boolean;

  @ApiPropertyOptional({ description: '启用数据提醒' })
  @IsBoolean()
  @IsOptional()
  dataReminderEnabled?: boolean;

  @ApiPropertyOptional({ description: '数据提醒时间' })
  @IsString()
  @IsOptional()
  dataReminderTime?: string;

  @ApiPropertyOptional({ description: '通知设置' })
  @IsObject()
  @IsOptional()
  notificationSettings?: {
    debtReminder: boolean;
    budgetAlert: boolean;
    weeklyReport: boolean;
    monthlyReport: boolean;
    reminderAdvanceDays: number;
  };
}
