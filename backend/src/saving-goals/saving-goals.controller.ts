import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SavingGoalsService } from './saving-goals.service';
import { CreateSavingGoalDto, UpdateSavingGoalDto } from './dto/saving-goal.dto';

@ApiTags('理财目标')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saving-goals')
export class SavingGoalsController {
  constructor(private readonly savingGoalsService: SavingGoalsService) {}

  @Post()
  @ApiOperation({ summary: '创建理财目标' })
  create(@Request() req: any, @Body() createDto: CreateSavingGoalDto) {
    return this.savingGoalsService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有理财目标' })
  findAll(@Request() req: any) {
    return this.savingGoalsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取理财目标详情' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.savingGoalsService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新理财目标' })
  update(@Request() req: any, @Param('id') id: string, @Body() updateDto: UpdateSavingGoalDto) {
    return this.savingGoalsService.update(req.user.id, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除理财目标' })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.savingGoalsService.remove(req.user.id, id);
  }
}
