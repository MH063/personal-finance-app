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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionsService, PaginationResult } from './transactions.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
  BatchDeleteDto,
  BatchUpdateCategoryDto,
} from './dto/transaction.dto';
import { Transaction } from '../entities/transaction.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import { extname } from 'path';

@ApiTags('交易')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: '创建交易记录' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Request() req: any, @Body() createDto: CreateTransactionDto) {
    return this.transactionsService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: '获取交易记录列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findAll(
    @Request() req: any,
    @Query() query: TransactionQueryDto,
  ): Promise<PaginationResult<Transaction>> {
    return this.transactionsService.findAll(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个交易记录' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  async findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新交易记录' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(req.user.id, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除交易记录' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.remove(req.user.id, id);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除交易记录' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async batchRemove(@Request() req: any, @Body() dto: BatchDeleteDto) {
    return this.transactionsService.batchRemove(req.user.id, dto);
  }

  @Post('batch-update-category')
  @ApiOperation({ summary: '批量更新交易分类' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async batchUpdateCategory(@Request() req: any, @Body() dto: BatchUpdateCategoryDto) {
    return this.transactionsService.batchUpdateCategory(req.user.id, dto);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '获取交易记录变更历史' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getHistory(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.getHistory(req.user.id, id);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/imports',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `import-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: '导入交易记录' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        overwrite: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '导入成功' })
  async importTransactions(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.transactionsService;
  }
}
