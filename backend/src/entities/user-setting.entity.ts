import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { User } from './user.entity';

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum Currency {
  CNY = 'CNY',
  USD = 'USD',
  EUR = 'EUR',
  JPY = 'JPY',
}

@Entity('user_settings')
export class UserSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'theme',
    type: 'enum',
    enum: ThemeMode,
    default: ThemeMode.SYSTEM,
  })
  theme: ThemeMode;

  @Column({
    name: 'currency',
    type: 'enum',
    enum: Currency,
    default: Currency.CNY,
  })
  currency: Currency;

  @Column({ name: 'language', length: 10, default: 'zh-CN' })
  language: string;

  @Column({ name: 'date_format', length: 50, default: 'YYYY-MM-DD' })
  dateFormat: string;

  @Column({ name: 'first_day_of_week', default: 0 })
  firstDayOfWeek: number;

  @Column({ name: 'decimal_places', default: 2 })
  decimalPlaces: number;

  @Column({ name: 'notification_settings', type: 'jsonb', nullable: true })
  notificationSettings: {
    debtReminder: boolean;
    budgetAlert: boolean;
    weeklyReport: boolean;
    monthlyReport: boolean;
    reminderAdvanceDays: number;
  };

  @Column({ name: 'default_payment_method', nullable: true })
  defaultPaymentMethod: string;

  @Column({ name: 'quick_add_enabled', default: true })
  quickAddEnabled: boolean;

  @Column({ name: 'data_reminder_enabled', default: true })
  dataReminderEnabled: boolean;

  @Column({ name: 'data_reminder_time', length: 10, default: '20:00' })
  dataReminderTime: string;

  @Column({ name: 'webauthn_credentials', type: 'jsonb', nullable: true })
  webauthnCredentials: Array<{
    id: string;
    publicKeyJwk: any;
    signCount?: number;
    transports?: string[];
    deviceName?: string;
    userAgent?: string;
    createdAt: string;
  }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
