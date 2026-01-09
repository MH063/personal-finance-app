import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting } from '../entities/user-setting.entity';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
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
    const settings = await this.getSettings(userId);

    // 合并通知设置
    if (dto.notificationSettings && settings.notificationSettings) {
      dto.notificationSettings = {
        ...settings.notificationSettings,
        ...dto.notificationSettings,
      };
    }

    Object.assign(settings, dto);
    return this.userSettingRepository.save(settings);
  }
}
