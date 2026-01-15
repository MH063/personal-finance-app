import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting, ThemeMode, Currency } from '../entities/user-setting.entity';
import { UpdateSettingsDto } from './dto/settings.dto';
import { LedgerGateway } from '../ledgers/ledger.gateway';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly ledgerGateway: LedgerGateway,
  ) {}

  /**
   * 获取用户设置
   * @param userId 用户ID
   */
  async getSettings(userId: string): Promise<UserSetting> {
    const settings = await this.userSettingRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      throw new NotFoundException('未找到用户设置');
    }

    return settings;
  }

  /**
   * 更新用户设置
   * @param userId 用户ID
   * @param dto 更新数据
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSetting> {
    let settings = await this.userSettingRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      settings = this.userSettingRepository.create({
        userId,
        theme: ThemeMode.SYSTEM,
        currency: Currency.CNY,
        language: 'zh-CN',
        dateFormat: 'YYYY-MM-DD',
        firstDayOfWeek: 0,
        decimalPlaces: 2,
        notificationSettings: {
          debtReminder: true,
          budgetAlert: true,
          weeklyReport: false,
          monthlyReport: true,
          reminderAdvanceDays: 3,
        },
        quickAddEnabled: true,
        dataReminderEnabled: true,
        dataReminderTime: '20:00',
      });
    }

    // 合并通知设置
    if (dto.notificationSettings) {
      settings.notificationSettings = {
        ...(settings.notificationSettings || {}),
        ...dto.notificationSettings,
      };
    }

    // 移除 dto 中的 notificationSettings，防止 Object.assign 覆盖上面的合并结果
    const { notificationSettings, ...otherProps } = dto;
    Object.assign(settings, otherProps);

    const savedSettings = await this.userSettingRepository.save(settings);

    // 发送实时更新通知
    this.ledgerGateway.notifySettingsUpdate(userId, savedSettings);

    return savedSettings;
  }
}
