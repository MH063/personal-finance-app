import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { Budget } from '../entities/budget.entity';
import { Transaction } from '../entities/transaction.entity';
import { LedgersModule } from '../ledgers/ledgers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Budget, Transaction]),
    LedgersModule,
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
