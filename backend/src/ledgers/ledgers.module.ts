import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgersService } from './ledgers.service';
import { LedgersController } from './ledgers.controller';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';
import { LedgerGateway } from './ledger.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ledger, LedgerMember, User, Transaction]),
    AuthModule, // 使用 AuthModule 提供的配置好的 JwtModule
  ],
  providers: [LedgersService, LedgerGateway],
  controllers: [LedgersController],
  exports: [LedgersService, LedgerGateway],
})
export class LedgersModule {}
