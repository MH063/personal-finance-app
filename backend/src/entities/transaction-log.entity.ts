import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum LogAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore',
}

export enum EntityType {
  TRANSACTION = 'transaction',
  CATEGORY = 'category',
  DEBT = 'debt',
  DEBT_PAYMENT = 'debt_payment',
  USER = 'user',
  SETTINGS = 'settings',
  BUDGET = 'budget',
}

@Entity('transaction_logs')
@Index('idx_logs_user_entity', ['userId', 'entityType', 'entityId'])
export class TransactionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'action',
    type: 'enum',
    enum: LogAction,
  })
  action: LogAction;

  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: EntityType,
  })
  entityType: EntityType;

  @Column({ name: 'entity_id', length: 36 })
  entityId: string;

  @Column({ name: 'old_data', type: 'jsonb', nullable: true })
  oldData: Record<string, any>;

  @Column({ name: 'new_data', type: 'jsonb', nullable: true })
  newData: Record<string, any>;

  @Column({ name: 'changed_fields', type: 'jsonb', nullable: true })
  changedFields: string[];

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', length: 500, nullable: true })
  userAgent: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
