import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('saving_goals')
export class SavingGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'target_amount', type: 'decimal', precision: 18, scale: 2 })
  targetAmount: number;

  @Column({ name: 'current_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentAmount: number;

  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: Date;

  @Column({ name: 'currency', length: 10, default: 'CNY' })
  currency: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
  })
  status: string;

  @Column({ name: 'auto_transfer', default: false })
  autoTransfer: boolean;

  @Column({
    name: 'auto_transfer_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  autoTransferAmount: number;

  @Column({ name: 'auto_transfer_day', type: 'int', nullable: true })
  autoTransferDay: number; // 1-28/31

  @Column({ name: 'last_transfer_date', type: 'date', nullable: true })
  lastTransferDate: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
