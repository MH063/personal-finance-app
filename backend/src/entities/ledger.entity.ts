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
} from 'typeorm';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';

export enum LedgerType {
  PRIVATE = 'private',
  SHARED = 'shared',
}

@Entity('ledgers')
export class Ledger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({
    type: 'enum',
    enum: LedgerType,
    default: LedgerType.PRIVATE,
  })
  type: LedgerType;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @OneToMany(() => LedgerMember, (member) => member.ledger)
  members: LedgerMember[];

  @OneToMany(() => Transaction, (transaction) => transaction.ledger)
  transactions: Transaction[];
}

@Entity('ledger_members')
export class LedgerMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ledger_id' })
  ledgerId: string;

  @ManyToOne(() => Ledger, (ledger) => ledger.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ledger_id' })
  ledger: Ledger;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    length: 20,
    default: 'member',
  })
  role: string; // 'owner', 'admin', 'member', 'viewer'

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
