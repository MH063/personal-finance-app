import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoalsController } from './saving-goals.controller';
import { SavingGoal } from '../entities/saving-goal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavingGoal])],
  controllers: [SavingGoalsController],
  providers: [SavingGoalsService],
  exports: [SavingGoalsService],
})
export class SavingGoalsModule {}
