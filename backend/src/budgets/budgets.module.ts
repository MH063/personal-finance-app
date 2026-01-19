import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { Budget } from '../entities/budget.entity';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { TransactionLog } from '../entities/transaction-log.entity';
import { LedgersModule } from '../ledgers/ledgers.module';
import { StatisticsModule } from '../statistics/statistics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Budget, Transaction, Category, TransactionLog]),
    LedgersModule,
    StatisticsModule,
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
