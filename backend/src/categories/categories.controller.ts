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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
  ReorderCategoriesDto,
  CreateDefaultCategoriesDto,
} from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('分类')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: '创建分类' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Request() req: any, @Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(req.user.id, createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: '获取分类列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async findAll(@Request() req: any, @Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(req.user.id, query);
  }

  @Get('tree')
  @ApiOperation({ summary: '获取分类树形结构' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiQuery({ name: 'type', required: false, enum: ['income', 'expense'] })
  async findTree(@Request() req: any, @Query('type') type?: string) {
    return this.categoriesService.findTree(req.user.id, type as any);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个分类详情' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新分类' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(req.user.id, id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除分类' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(req.user.id, id);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除分类' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async batchRemove(@Request() req: any, @Body('ids') ids: string[]) {
    return this.categoriesService.batchRemove(req.user.id, ids);
  }

  @Post('reorder')
  @ApiOperation({ summary: '重新排序分类' })
  @ApiResponse({ status: 200, description: '排序成功' })
  async reorder(@Request() req: any, @Body() reorderDto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(req.user.id, reorderDto.ids);
  }

  @Post('defaults')
  @ApiOperation({ summary: '创建默认分类' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createDefaults(@Request() req: any, @Body() dto: CreateDefaultCategoriesDto) {
    return this.categoriesService.createDefaults(req.user.id, dto.type);
  }
}
