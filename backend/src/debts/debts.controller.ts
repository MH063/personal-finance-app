import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DebtsService } from './debts.service';
import {
  CreateDebtDto,
  UpdateDebtDto,
  CreatePaymentDto,
  DebtQueryDto,
  DebtStatisticsDto,
} from './dto/debt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('债务')
@Controller('debts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Post()
  @ApiOperation({ summary: '创建债务记录' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Request() req: any, @Body() createDto: CreateDebtDto) {
    return this.debtsService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: '获取债务列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findAll(@Request() req: any, @Query() query: DebtQueryDto) {
    return this.debtsService.findAll(req.user.id, query);
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取债务统计信息' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getStatistics(@Request() req: any, @Query() query: DebtStatisticsDto) {
    return this.debtsService.getStatistics(req.user.id, query.includePaid);
  }

  @Get('reminders')
  @ApiOperation({ summary: '获取需要提醒的债务' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getReminders(@Request() req: any) {
    return this.debtsService.getReminders(req.user.id);
  }

  @Post('sync-transactions')
  @ApiOperation({ summary: '同步历史债务数据到交易流水' })
  @ApiResponse({ status: 200, description: '同步成功' })
  async syncTransactions(@Request() req: any) {
    return this.debtsService.syncAllToTransactions(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取债务详情（包含还款记录）' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '债务不存在' })
  async findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.debtsService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新债务记录' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateDebtDto,
  ) {
    return this.debtsService.update(req.user.id, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除债务记录' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.debtsService.remove(req.user.id, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: '添加还款记录' })
  @ApiResponse({ status: 201, description: '添加成功' })
  async addPayment(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() paymentDto: CreatePaymentDto,
  ) {
    return this.debtsService.addPayment(req.user.id, id, paymentDto);
  }

  @Delete(':id/payments/:paymentId')
  @ApiOperation({ summary: '删除还款记录' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async removePayment(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.debtsService.removePayment(req.user.id, id, paymentId);
  }
}
