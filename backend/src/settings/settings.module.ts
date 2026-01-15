import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UserSetting } from '../entities/user-setting.entity';
import { AuthModule } from '../auth/auth.module';
import { LedgersModule } from '../ledgers/ledgers.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserSetting]), AuthModule, LedgersModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
