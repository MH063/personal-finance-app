import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { TransactionLog } from '../entities/transaction-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, TransactionLog]),
    MulterModule.register({
      dest: './uploads/imports',
    }),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
