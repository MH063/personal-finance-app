import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum BackupType {
  FULL = 'full',
  TRANSACTIONS = 'transactions',
  CATEGORIES = 'categories',
  DEBTS = 'debts',
  SETTINGS = 'settings',
}

@Entity('backup_logs')
export class BackupLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'backup_type',
    type: 'enum',
    enum: BackupType,
    default: BackupType.FULL,
  })
  backupType: BackupType;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', length: 500, nullable: true })
  filePath: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number;

  @Column({ name: 'is_encrypted', default: false })
  isEncrypted: boolean;

  @Column({ name: 'record_count', type: 'int', nullable: true })
  recordCount: number;

  @Column({ name: 'checksum', length: 64, nullable: true })
  checksum: string;

  @Column({ name: 'is_success', default: true })
  isSuccess: boolean;

  @Column({ name: 'is_restored', default: false })
  isRestored: boolean;

  @Column({ name: 'last_restored_at', type: 'timestamp', nullable: true })
  lastRestoredAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.backups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
