import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType, NotificationPriority } from '../../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ description: '通知标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '通知内容' })
  @IsString()
  content: string;

  @ApiProperty({ enum: NotificationType, description: '通知类型' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ enum: NotificationPriority, description: '优先级' })
  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @ApiProperty({ description: '跳转链接', required: false })
  @IsString()
  @IsOptional()
  link?: string;
}

export class NotificationQueryDto {
  @ApiProperty({ description: '是否已读', required: false })
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @ApiProperty({ description: '每页数量', default: 20 })
  @IsOptional()
  limit?: number;

  @ApiProperty({ description: '偏移量', default: 0 })
  @IsOptional()
  offset?: number;
}
