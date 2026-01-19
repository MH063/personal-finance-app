import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { DebtsModule } from './debts/debts.module';
import { StatisticsModule } from './statistics/statistics.module';
import { BackupModule } from './backup/backup.module';
import { SettingsModule } from './settings/settings.module';
import { BudgetsModule } from './budgets/budgets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LedgersModule } from './ledgers/ledgers.module';
import { SavingGoalsModule } from './saving-goals/saving-goals.module';
import { AiDiagnosisModule } from './ai-diagnosis/ai-diagnosis.module';
import { ReportsModule } from './reports/reports.module';
import { RedisModule } from './common/redis/redis.module';
import { AppController } from './app.controller';
import { dataSourceOptions } from './config/data-source';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TransactionLog } from './entities/transaction-log.entity';
import { NetworkMonitorService } from './common/services/network-monitor.service';
import { WebAuthnModule } from './webauthn/webauthn.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
      expandVariables: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => dataSourceOptions,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([TransactionLog]),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 60, // 临时提升到 60 以避免前端初始化时的并发请求误触限流
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 150, // 每分钟最多 150 个请求
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 3000, // 每小时最多 3000 个请求
      },
    ]),
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    DebtsModule,
    StatisticsModule,
    BackupModule,
    SettingsModule,
    BudgetsModule,
    NotificationsModule,
    LedgersModule,
    SavingGoalsModule,
    AiDiagnosisModule,
    ReportsModule,
    RedisModule,
    WebAuthnModule,
  ],
  controllers: [AppController],
  providers: [
    NetworkMonitorService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
