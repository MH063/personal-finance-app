import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt } from '../entities/debt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Category, Debt])],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
