import { IsEnum, IsOptional, IsBoolean, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BackupType } from '../../entities/backup-log.entity';

export class CreateBackupDto {
  @ApiPropertyOptional({ enum: BackupType, description: '备份类型', default: BackupType.FULL })
  @IsEnum(BackupType)
  @IsOptional()
  backupType?: BackupType = BackupType.FULL;

  @ApiPropertyOptional({ description: '是否加密备份', default: true })
  @IsBoolean()
  @IsOptional()
  encrypt?: boolean = true;

  @ApiPropertyOptional({ description: '备份描述' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class RestoreBackupDto {
  @ApiProperty({ description: '备份文件ID或路径' })
  @IsString()
  backupId: string;

  @ApiPropertyOptional({ description: '恢复密码（如果备份已加密）' })
  @IsString()
  @IsOptional()
  password?: string;
}

export class BackupQueryDto {
  @ApiPropertyOptional({ enum: BackupType })
  @IsEnum(BackupType)
  @IsOptional()
  backupType?: BackupType;

  @ApiPropertyOptional({ description: '是否只显示成功的备份' })
  @IsOptional()
  successfulOnly?: boolean = true;
}

export class CleanupBackupDto {
  @ApiProperty({ description: '保留最近N个备份', default: 10 })
  @IsOptional()
  keepCount?: number = 10;

  @ApiPropertyOptional({ description: '删除早于该日期的备份' })
  @IsDateString()
  @IsOptional()
  olderThan?: string;
}
