import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerType, LedgerRole } from '../../entities/ledger.entity';

export class CreateLedgerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(LedgerType)
  @IsOptional()
  type?: LedgerType;

  // 币种（ISO 代码，如 CNY、USD）
  @IsString()
  @IsNotEmpty()
  currency: string;

  // 起始日期（YYYY-MM-DD）
  @IsString()
  @IsNotEmpty()
  startDate: string;

  // 初始金额（≥0）
  @IsNumber()
  @IsNotEmpty()
  initialAmount: number;
}

export class UpdateLedgerDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '币种（ISO 代码）' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: '起始日期（YYYY-MM-DD）' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '初始金额' })
  @IsNumber()
  @IsOptional()
  initialAmount?: number;

  @ApiPropertyOptional({ description: '版本号' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class AddMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(LedgerRole)
  @IsOptional()
  role?: LedgerRole;
}
