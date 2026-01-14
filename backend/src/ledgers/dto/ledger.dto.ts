import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerType } from '../../entities/ledger.entity';

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

  @ApiPropertyOptional({ description: '版本号' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class AddMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  role?: string;
}
