import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAlertService } from './ai-alert.service';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgersModule } from '../ledgers/ledgers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Budget]),
    NotificationsModule,
    LedgersModule,
  ],
  providers: [AiAlertService],
  exports: [AiAlertService],
})
export class AiAlertModule {}
