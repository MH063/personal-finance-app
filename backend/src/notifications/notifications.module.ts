import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { Notification } from '../entities/notification.entity';
import { LedgersModule } from '../ledgers/ledgers.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Budget, Notification]), LedgersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
