import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  BadRequestException,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { readFileSync } from 'fs';
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
  BatchCreateTransactionDto,
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

  @Post('batch-create')
  @ApiOperation({ summary: '批量创建交易记录' })
  @ApiResponse({ status: 200, description: '批量创建成功' })
  async batchCreate(@Request() req: any, @Body() dto: BatchCreateTransactionDto) {
    return this.transactionsService.batchCreate(req.user.id, dto);
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
  @ApiOperation({ summary: '永久删除交易记录', description: '物理删除交易记录，操作不可恢复。' })
  @ApiResponse({ status: 200, description: '删除成功（物理删除）' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.remove(req.user.id, id);
  }

  @Post('batch-delete')
  @ApiOperation({
    summary: '批量永久删除交易记录',
    description: '批量物理删除交易记录，操作不可恢复。',
  })
  @ApiResponse({ status: 200, description: '删除成功（物理删除）' })
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
  async importTransactions(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('overwrite') overwrite?: string | boolean,
  ) {
    if (!file?.path) {
      throw new BadRequestException('导入文件无效');
    }

    const overwriteEnabled = overwrite === true || overwrite === 'true';
    if (overwriteEnabled) {
      throw new BadRequestException('暂不支持覆盖导入');
    }

    let parsed: any;
    try {
      const raw = readFileSync(file.path, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('导入文件解析失败，仅支持 JSON 格式');
    }

    const items: any[] = Array.isArray(parsed)
      ? parsed
      : parsed?.transactions || parsed?.data?.transactions || parsed?.data || parsed?.items;

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('导入文件格式不正确，需要 JSON 数组或包含 transactions 数组');
    }

    let importedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        const amount = Number(item.amount ?? item.originalAmount ?? item.money);
        const type = item.type;
        const transactionDate = item.transactionDate || item.date || item.createdAt;

        if (!amount || !type || !transactionDate) {
          failedCount++;
          continue;
        }

        await this.transactionsService.create(req.user.id, {
          amount,
          type,
          categoryId: item.categoryId,
          description: item.description,
          paymentMethod: item.paymentMethod,
          merchant: item.merchant,
          transactionDate: new Date(transactionDate).toISOString(),
          metadata: item.metadata,
          ledgerId: item.ledgerId,
        });
        importedCount++;
      } catch {
        failedCount++;
      }
    }

    return {
      importedCount,
      failedCount,
      total: items.length,
    };
  }
}
