import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('通知')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '获取通知列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getNotifications(@Request() req: any, @Query() query: NotificationQueryDto) {
    return this.notificationsService.getNotifications(req.user.id, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '标记通知为已读' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async markAsRead(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(req.user.id, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: '标记所有通知为已读' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteNotification(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.deleteNotification(req.user.id, id);
  }

  @Post('clear-read')
  @ApiOperation({ summary: '清空已读通知' })
  @ApiResponse({ status: 200, description: '清空成功' })
  async clearReadNotifications(@Request() req: any) {
    return this.notificationsService.clearReadNotifications(req.user.id);
  }
}
