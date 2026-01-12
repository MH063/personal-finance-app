import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgersModule } from '../ledgers/ledgers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Debt, DebtPayment]),
    NotificationsModule,
    LedgersModule,
  ],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
