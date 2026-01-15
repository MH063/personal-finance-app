import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupLog } from '../entities/backup-log.entity';
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt } from '../entities/debt.entity';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Budget } from '../entities/budget.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { TransactionLog } from '../entities/transaction-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BackupLog,
      User,
      Transaction,
      Category,
      Debt,
      Ledger,
      LedgerMember,
      DebtPayment,
      Budget,
      UserSetting,
      TransactionLog,
    ]),
  ],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
