import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { DebtPayment } from './debt-payment.entity';

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

@Entity('debts')
@Index('idx_debts_user_status', ['userId', 'status'])
@Index('idx_debts_user_due_date', ['userId', 'dueDate'])
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'debtor_name', length: 100 })
  debtorName: string;

  @Column({ name: 'original_amount', type: 'decimal', precision: 12, scale: 2 })
  originalAmount: number;

  @Column({ name: 'remaining_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  remainingAmount: number;

  @Column({
    name: 'debt_type',
    type: 'enum',
    enum: DebtType,
  })
  debtType: DebtType;

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

  @Column({ name: 'interest_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  interestRate: number;

  @Column({ name: 'reminder_date', type: 'date', nullable: true })
  reminderDate: Date;

  @Column({ name: 'is_reminder_enabled', default: true })
  isReminderEnabled: boolean;

  @Column({ name: 'is_notified', default: false })
  isNotified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'user_id' })
  userId: string;

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
    select: false,
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
