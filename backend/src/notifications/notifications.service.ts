import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { CreateNotificationDto, NotificationQueryDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * 获取用户通知列表
   * @param userId 用户ID
   * @param query 查询参数
   */
  async getNotifications(userId: string, query: NotificationQueryDto) {
    const { isRead, limit = 20, offset = 0 } = query;

    const where: any = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [items, total] = await this.notificationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    const unreadCount = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    return {
      items,
      total,
      unreadCount,
    };
  }

  /**
   * 创建通知
   * @param userId 用户ID
   * @param dto 通知数据
   */
  async createNotification(userId: string, dto: CreateNotificationDto) {
    const notification = this.notificationRepository.create({
      ...dto,
      userId,
    });
    return this.notificationRepository.save(notification);
  }

  /**
   * 标记通知为已读
   * @param userId 用户ID
   * @param id 通知ID
   */
  async markAsRead(userId: string, id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  /**
   * 标记所有通知为已读
   * @param userId 用户ID
   */
  async markAllAsRead(userId: string) {
    await this.notificationRepository.update({ userId, isRead: false }, { isRead: true });
    return { success: true };
  }

  /**
   * 删除通知
   * @param userId 用户ID
   * @param id 通知ID
   */
  async deleteNotification(userId: string, id: string) {
    const result = await this.notificationRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('通知不存在');
    }
    return { success: true };
  }

  /**
   * 清空已读通知
   * @param userId 用户ID
   */
  async clearReadNotifications(userId: string) {
    await this.notificationRepository.delete({ userId, isRead: true });
    return { success: true };
  }
}
