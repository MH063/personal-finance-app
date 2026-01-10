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
import { AppController } from './app.controller';
import { dataSourceOptions } from './config/data-source';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TransactionLog } from './entities/transaction-log.entity';

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
        limit: 10, // 每秒最多 10 个请求
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 120, // 每分钟最多 120 个请求 (略微提高以适配高并发测试后的正常使用)
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 2000, // 每小时最多 2000 个请求
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
  ],
  controllers: [AppController],
  providers: [
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
