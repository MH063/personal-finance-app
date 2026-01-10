import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, UpdateBudgetDto, BudgetResponseDto } from './dto/budget.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('预算')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: '创建预算' })
  @ApiResponse({ status: 201, type: BudgetResponseDto })
  async create(@Request() req: any, @Body() createBudgetDto: CreateBudgetDto) {
    return await this.budgetsService.create(req.user.id, createBudgetDto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有预算' })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  async findAll(@Request() req: any) {
    return await this.budgetsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取预算详情' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return await this.budgetsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新预算' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateBudgetDto: UpdateBudgetDto,
  ) {
    return await this.budgetsService.update(req.user.id, id, updateBudgetDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除预算' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return await this.budgetsService.remove(req.user.id, id);
  }
}
