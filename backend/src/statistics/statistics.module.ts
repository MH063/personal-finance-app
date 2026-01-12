import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { Transaction } from '../entities/transaction.entity';
import { Debt } from '../entities/debt.entity';
import { Budget } from '../entities/budget.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Debt, Budget])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
