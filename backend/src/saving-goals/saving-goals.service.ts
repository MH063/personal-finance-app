import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { SavingGoal } from '../entities/saving-goal.entity';
import { CreateSavingGoalDto, UpdateSavingGoalDto } from './dto/saving-goal.dto';

@Injectable()
export class SavingGoalsService {
  private readonly logger = new Logger(SavingGoalsService.name);

  constructor(
    @InjectRepository(SavingGoal)
    private savingGoalRepository: Repository<SavingGoal>,
  ) {}

  async create(userId: string, createDto: CreateSavingGoalDto): Promise<SavingGoal> {
    const goal = this.savingGoalRepository.create({
      ...createDto,
      userId,
    });
    return this.savingGoalRepository.save(goal);
  }

  async findAll(userId: string): Promise<SavingGoal[]> {
    return this.savingGoalRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<SavingGoal> {
    const goal = await this.savingGoalRepository.findOne({
      where: { id, userId },
    });
    if (!goal) {
      throw new NotFoundException('理财目标不存在');
    }
    return goal;
  }

  async update(userId: string, id: string, updateDto: UpdateSavingGoalDto): Promise<SavingGoal> {
    const goal = await this.findOne(userId, id);
    Object.assign(goal, updateDto);
    return this.savingGoalRepository.save(goal);
  }

  async remove(userId: string, id: string): Promise<void> {
    const goal = await this.findOne(userId, id);
    await this.savingGoalRepository.remove(goal);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAutoTransfer() {
    this.logger.log('Running auto transfer check...');
    const today = dayjs();
    const dayOfMonth = today.date();

    // 简单实现：只处理设置了当天为划转日的活跃目标
    // 注意：未处理月底日期边界情况（如设置31号但在2月）
    const goals = await this.savingGoalRepository.find({
      where: {
        status: 'active',
        autoTransfer: true,
        autoTransferDay: dayOfMonth,
      },
    });

    for (const goal of goals) {
      if (goal.currentAmount >= goal.targetAmount) continue;

      // 检查今天是否已经执行过
      if (goal.lastTransferDate) {
        const last = dayjs(goal.lastTransferDate);
        if (last.isSame(today, 'day')) continue;
      }

      const amount = Number(goal.autoTransferAmount || 0);
      if (amount <= 0) continue;

      goal.currentAmount = Number(goal.currentAmount) + amount;
      goal.lastTransferDate = today.toDate();

      // 检查是否完成
      if (goal.currentAmount >= goal.targetAmount) {
        goal.status = 'completed';
        this.logger.log(`Goal ${goal.name} completed via auto transfer!`);
      }

      await this.savingGoalRepository.save(goal);
      this.logger.log(`Auto transferred ${amount} to goal ${goal.name}`);
    }
  }
}
