import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  AfterLoad,
} from 'typeorm';
import { User } from './user.entity';
import { DebtPayment } from './debt-payment.entity';
import { PaymentMethod } from './transaction.entity';

export enum DebtType {
  BORROW = 'borrow',
  LEND = 'lend',
}

export enum DebtStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export enum RepaymentType {
  EQUAL_LOAN_PAYMENTS = 'equal_loan_payments', // 等额本息
  EQUAL_PRINCIPAL_PAYMENTS = 'equal_principal_payments', // 等额本金
  INTEREST_FIRST = 'interest_first', // 先息后本
  ONE_TIME_PAYMENT = 'one_time_payment', // 一次性还本付息
  CUSTOM = 'custom', // 自定义
}

export enum RepaymentDayAdjustment {
  NONE = 'none',
  WORKDAY = 'workday', // 顺延至下一个工作日
}

@Entity('debts')
@Index('idx_debts_user_status', ['userId', 'status'])
@Index('idx_debts_user_due_date', ['userId', 'dueDate'])
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'debtor_name', length: 100 })
  debtorName: string;

  @Column({ name: 'original_amount', type: 'decimal', precision: 18, scale: 2 })
  originalAmount: number;

  @Column({ name: 'remaining_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  remainingAmount: number;

  @Column({
    name: 'debt_type',
    type: 'enum',
    enum: DebtType,
  })
  debtType: DebtType;

  @Column({ name: 'loan_date', type: 'date', nullable: true })
  loanDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ name: 'paid_date', type: 'date', nullable: true })
  paidDate: Date;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DebtStatus,
    default: DebtStatus.PENDING,
  })
  status: DebtStatus;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.OTHER,
  })
  paymentMethod: PaymentMethod;

  @Column({
    name: 'repayment_type',
    type: 'enum',
    enum: RepaymentType,
    default: RepaymentType.CUSTOM,
  })
  repaymentType: RepaymentType;

  @Column({ name: 'repayment_day', type: 'int', nullable: true })
  repaymentDay: number;

  @Column({
    name: 'repayment_day_adjustment',
    type: 'enum',
    enum: RepaymentDayAdjustment,
    default: RepaymentDayAdjustment.NONE,
  })
  repaymentDayAdjustment: RepaymentDayAdjustment;

  @Column({ name: 'interest_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  interestRate: number;

  @Column({ name: 'reminder_date', type: 'date', nullable: true })
  reminderDate: Date;

  @Column({ name: 'is_reminder_enabled', default: true })
  isReminderEnabled: boolean;

  @Column({ name: 'is_notified', default: false })
  isNotified: boolean;

  @Column({ name: 'user_id' })
  userId: string;

  // 虚拟字段：累计利息（不存数据库，运行时计算）
  accumulatedInterest: number;

  @AfterLoad()
  calculateInterest() {
    if (this.loanDate && this.remainingAmount > 0 && this.interestRate > 0) {
      const start = new Date(this.loanDate);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Simple interest: Principal * Rate * Time
      this.accumulatedInterest = Number(
        (
          Number(this.remainingAmount) *
          (Number(this.interestRate) / 100) *
          (diffDays / 365)
        ).toFixed(2),
      );
    } else {
      this.accumulatedInterest = 0;
    }
  }

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => User, (user) => user.debts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => DebtPayment, (payment) => payment.debt)
  payments: DebtPayment[];

  @Column({ name: 'payment_count', default: 0, select: false })
  paymentCount: number;

  @Column({
    name: 'total_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalPaid: number;

  get isOverdue(): boolean {
    if (this.status === DebtStatus.PAID) return false;
    if (!this.dueDate) return false;
    return new Date(this.dueDate) < new Date();
  }

  get paidPercentage(): number {
    if (this.originalAmount === 0) return 100;
    return Number(((this.totalPaid / this.originalAmount) * 100).toFixed(2));
  }
}
