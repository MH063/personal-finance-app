import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { Transaction } from '../entities/transaction.entity';
import { CreateLedgerDto, UpdateLedgerDto, AddMemberDto } from './dto/ledger.dto';
import { User } from '../entities/user.entity';
import { LedgerGateway } from './ledger.gateway';

@Injectable()
export class LedgersService {
  private readonly logger = new Logger(LedgersService.name);

  constructor(
    @InjectRepository(Ledger)
    private readonly ledgerRepository: Repository<Ledger>,
    @InjectRepository(LedgerMember)
    private readonly ledgerMemberRepository: Repository<LedgerMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly ledgerGateway: LedgerGateway,
  ) {}

  /**
   * 获取用户参与的所有账本
   */
  async findAll(userId: string): Promise<Ledger[]> {
    const memberships = await this.ledgerMemberRepository.find({
      where: { userId },
      relations: ['ledger', 'ledger.owner'],
    });
    return memberships.map((m) => m.ledger);
  }

  /**
   * 获取单个账本详情
   */
  async findOne(id: string, userId: string): Promise<Ledger> {
    const ledger = await this.ledgerRepository.findOne({
      where: { id },
      relations: ['members', 'members.user', 'owner'],
    });

    if (!ledger) {
      throw new NotFoundException('账本不存在');
    }

    const membership = await this.ledgerMemberRepository.findOne({
      where: { ledgerId: id, userId },
    });

    if (!membership && ledger.ownerId !== userId) {
      throw new ForbiddenException('您没有权限访问此账本');
    }

    return ledger;
  }

  /**
   * 创建新账本
   */
  async create(createLedgerDto: CreateLedgerDto, userId: string): Promise<Ledger> {
    const ledger = this.ledgerRepository.create({
      ...createLedgerDto,
      ownerId: userId,
    });

    const savedLedger = await this.ledgerRepository.save(ledger);

    const member = this.ledgerMemberRepository.create({
      ledgerId: savedLedger.id,
      userId: userId,
      role: 'owner',
    });

    await this.ledgerMemberRepository.save(member);

    // 发送实时更新通知到个人房间
    this.ledgerGateway.notifyUpdate(null, 'LEDGER_CREATED', savedLedger, userId);

    return savedLedger;
  }

  /**
   * 检查用户在账本中的权限
   */
  private async checkPermission(
    ledgerId: string,
    userId: string,
    requiredRoles: string[],
  ): Promise<LedgerMember> {
    const membership = await this.ledgerMemberRepository.findOne({
      where: { ledgerId, userId },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('您没有足够的权限执行此操作');
    }

    return membership;
  }

  /**
   * 更新账本信息
   */
  async update(id: string, updateLedgerDto: UpdateLedgerDto, userId: string): Promise<Ledger> {
    const ledger = await this.findOne(id, userId);

    // 只有所有者和管理员可以修改账本信息
    await this.checkPermission(id, userId, ['owner', 'admin']);

    // 乐观锁校验
    if (updateLedgerDto.version !== undefined && ledger.version !== updateLedgerDto.version) {
      throw new OptimisticLockVersionMismatchError(
        'Ledger',
        updateLedgerDto.version,
        ledger.version,
      );
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const { version: _version, ...updateData } = updateLedgerDto;
    Object.assign(ledger, updateData);

    const updatedLedger = await this.ledgerRepository.save(ledger);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(id, 'LEDGER_UPDATED', updatedLedger, userId);

    return updatedLedger;
  }

  /**
   * 添加成员到账本
   */
  async addMember(
    ledgerId: string,
    addMemberDto: AddMemberDto,
    userId: string,
  ): Promise<LedgerMember> {
    await this.findOne(ledgerId, userId);

    // 只有所有者和管理员可以添加成员
    await this.checkPermission(ledgerId, userId, ['owner', 'admin']);

    const targetUser = await this.userRepository.findOne({ where: { id: addMemberDto.userId } });
    if (!targetUser) {
      throw new NotFoundException('目标用户不存在');
    }

    const existingMember = await this.ledgerMemberRepository.findOne({
      where: { ledgerId, userId: addMemberDto.userId },
    });

    if (existingMember) {
      return existingMember;
    }

    const member = this.ledgerMemberRepository.create({
      ledgerId,
      userId: addMemberDto.userId,
      role: addMemberDto.role || 'member',
    });

    const savedMember = await this.ledgerMemberRepository.save(member);

    // 发送实时通知
    this.ledgerGateway.notifyUpdate(ledgerId, 'MEMBER_ADDED', savedMember, userId);
    // 同时通知被添加的用户
    this.ledgerGateway.notifyUpdate(ledgerId, 'JOINED_LEDGER', { ledgerId }, addMemberDto.userId);

    return savedMember;
  }

  /**
   * 移除成员
   */
  async removeMember(ledgerId: string, targetUserId: string, userId: string): Promise<void> {
    const ledger = await this.findOne(ledgerId, userId);

    // 如果不是移除自己，则需要管理员或所有者权限
    if (targetUserId !== userId) {
      const myMembership = await this.checkPermission(ledgerId, userId, ['owner', 'admin']);

      // 管理员不能移除所有者
      if (ledger.ownerId === targetUserId) {
        throw new ForbiddenException('不能移除账本所有者');
      }

      // 如果是管理员移除成员，需要检查目标成员的角色
      if (myMembership.role === 'admin') {
        const targetMembership = await this.ledgerMemberRepository.findOne({
          where: { ledgerId, userId: targetUserId },
        });
        // 管理员不能移除其他管理员（除非是所有者）
        if (targetMembership?.role === 'admin') {
          throw new ForbiddenException('管理员不能移除其他管理员');
        }
      }
    } else {
      // 移除自己
      if (ledger.ownerId === targetUserId) {
        throw new ForbiddenException('账本所有者不能退出账本，请先转让所有权或删除账本');
      }
    }

    await this.ledgerMemberRepository.delete({ ledgerId, userId: targetUserId });

    // 发送实时通知
    this.ledgerGateway.notifyUpdate(ledgerId, 'MEMBER_REMOVED', { userId: targetUserId }, userId);
    // 同时通知被移除的用户
    this.ledgerGateway.notifyUpdate(ledgerId, 'LEFT_LEDGER', { ledgerId }, targetUserId);
  }

  /**
   * 删除账本及其相关数据
   */
  async remove(id: string, userId: string): Promise<void> {
    const ledger = await this.findOne(id, userId);

    // 只有所有者可以删除账本
    if (ledger.ownerId !== userId) {
      throw new ForbiddenException('只有所有者可以删除账本');
    }

    if (ledger.isDefault) {
      throw new ForbiddenException('不能删除默认账本');
    }

    // 1. 手动删除关联的交易记录（满足用户需求：同时删除交易记录）
    await this.transactionRepository.delete({ ledgerId: id });

    // 2. 删除账本（LedgerMember 会通过 CASCADE 自动删除）
    await this.ledgerRepository.remove(ledger);

    // 发送实时通知
    this.ledgerGateway.notifyUpdate(id, 'LEDGER_DELETED', { id }, userId);
  }
}
