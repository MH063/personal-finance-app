import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { TransactionLog } from '../entities/transaction-log.entity';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { LedgersModule } from '../ledgers/ledgers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, TransactionLog, Ledger, LedgerMember]),
    MulterModule.register({
      dest: './uploads/imports',
    }),
    LedgersModule, // 导入 LedgersModule 以便使用 LedgerGateway
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
