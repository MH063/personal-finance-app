import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LedgersService } from './ledgers.service';
import { CreateLedgerDto, UpdateLedgerDto, AddMemberDto } from './dto/ledger.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('账本管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ledgers')
export class LedgersController {
  constructor(private readonly ledgersService: LedgersService) {}

  @Get()
  @ApiOperation({ summary: '获取用户的所有账本' })
  async findAll(@Request() req: any) {
    return this.ledgersService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取账本详情' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.ledgersService.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: '创建新账本' })
  async create(@Body() createLedgerDto: CreateLedgerDto, @Request() req: any) {
    return this.ledgersService.create(createLedgerDto, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新账本信息' })
  async update(
    @Param('id') id: string,
    @Body() updateLedgerDto: UpdateLedgerDto,
    @Request() req: any,
  ) {
    return this.ledgersService.update(id, updateLedgerDto, req.user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: '添加账本成员' })
  async addMember(
    @Param('id') id: string,
    @Body() addMemberDto: AddMemberDto,
    @Request() req: any,
  ) {
    return this.ledgersService.addMember(id, addMemberDto, req.user.id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: '移除账本成员' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Request() req: any,
  ) {
    return this.ledgersService.removeMember(id, targetUserId, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除账本' })
  async remove(@Param('id') id: string, @Request() req: any) {
    console.log(`[LedgersController] Received DELETE request for ledger ID: ${id} by user: ${req.user.id}`);
    return this.ledgersService.remove(id, req.user.id);
  }
}
