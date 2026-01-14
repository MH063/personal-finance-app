import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository, OptimisticLockVersionMismatchError } from 'typeorm';
import { Category, CategoryType } from '../entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { LedgerGateway } from '../ledgers/ledger.gateway';

export interface CategoryTreeNode extends Omit<Category, 'children'> {
  children?: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: TreeRepository<Category>,
    private readonly ledgerGateway: LedgerGateway,
  ) {}

  /**
   * 创建分类
   */
  async create(userId: string, createCategoryDto: CreateCategoryDto): Promise<Category> {
    this.logger.log(`用户 ${userId} 创建分类: ${createCategoryDto.name}`);

    if (createCategoryDto.parentId) {
      const parentCategory = await this.categoryRepository.findOne({
        where: { id: createCategoryDto.parentId, userId },
      });

      if (!parentCategory) {
        throw new NotFoundException('父级分类不存在');
      }

      if (parentCategory.type !== createCategoryDto.type) {
        throw new BadRequestException('子分类必须与父级分类类型一致');
      }
    }

    const category = this.categoryRepository.create({
      ...createCategoryDto,
      userId,
      isSystem: false,
    });

    const savedCategory = await this.categoryRepository.save(category);
    this.logger.log(`分类创建成功: ${savedCategory.id}`);
    
    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_CREATED', savedCategory, userId);
    
    return savedCategory;
  }

  /**
   * 获取分类列表
   */
  async findAll(userId: string, query: CategoryQueryDto): Promise<Category[]> {
    const { type, includeChildren = true } = query;

    const queryBuilder = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.userId = :userId', { userId })
      .andWhere('category.isSystem = :isSystem', { isSystem: false });

    if (type) {
      queryBuilder.andWhere('category.type = :type', { type });
    }

    queryBuilder.orderBy('category.sortOrder', 'ASC');

    const categories = await queryBuilder.getMany();

    if (!includeChildren) {
      return categories.filter((c) => !c.parent);
    }

    return categories;
  }

  /**
   * 获取分类树形结构
   */
  async findTree(userId: string, type?: CategoryType): Promise<CategoryTreeNode[]> {
    const categories = await this.findAll(userId, { type, includeChildren: true });
    return this.buildTree(categories);
  }

  /**
   * 获取单个分类
   */
  async findOne(userId: string, id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id, userId },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    return category;
  }

  /**
   * 更新分类
   */
  async update(
    userId: string,
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    this.logger.log(`用户 ${userId} 更新分类: ${id}`);

    const category = await this.findOne(userId, id);

    if (category.isSystem && (updateCategoryDto.name || updateCategoryDto.parentId)) {
      throw new BadRequestException('系统内置分类不能修改名称和父级');
    }

    if (updateCategoryDto.parentId && updateCategoryDto.parentId !== id) {
      const parentCategory = await this.categoryRepository.findOne({
        where: { id: updateCategoryDto.parentId, userId },
      });

      if (!parentCategory) {
        throw new NotFoundException('父级分类不存在');
      }

      if (parentCategory.type !== category.type) {
        throw new BadRequestException('子分类必须与父级分类类型一致');
      }

      if (this.isDescendant(category, updateCategoryDto.parentId)) {
        throw new BadRequestException('不能将分类设置为其自身的子分类');
      }
    }

    // 乐观锁校验
    if (updateCategoryDto.version !== undefined && category.version !== updateCategoryDto.version) {
      throw new OptimisticLockVersionMismatchError('Category', updateCategoryDto.version, category.version);
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const { version, ...updateData } = updateCategoryDto;
    Object.assign(category, updateData);
    const updatedCategory = await this.categoryRepository.save(category);
    
    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_UPDATED', updatedCategory, userId);
    
    return updatedCategory;
  }

  /**
   * 删除分类
   */
  async remove(userId: string, id: string): Promise<void> {
    this.logger.log(`用户 ${userId} 删除分类: ${id}`);

    const category = await this.findOne(userId, id);

    if (category.isSystem) {
      throw new BadRequestException('系统内置分类不能删除');
    }

    const childCount = await this.categoryRepository.count({
      where: { parent: { id } },
    });

    if (childCount > 0) {
      throw new BadRequestException('该分类下存在子分类，请先删除子分类');
    }

    await this.categoryRepository.remove(category);
    this.logger.log(`分类删除成功: ${id}`);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_DELETED', { id }, userId);
  }

  /**
   * 批量删除分类
   */
  async batchRemove(userId: string, ids: string[]): Promise<{ deletedCount: number }> {
    const categories = await this.categoryRepository.find({
      where: ids.map((id) => ({ id, userId })),
    });

    const systemCategories = categories.filter((c) => c.isSystem);
    if (systemCategories.length > 0) {
      throw new BadRequestException('系统内置分类不能删除');
    }

    const deletableCategories = categories.filter((c) => !c.isSystem);
    await this.categoryRepository.remove(deletableCategories);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_BATCH_DELETED', { ids: deletableCategories.map(c => c.id) }, userId);

    return { deletedCount: deletableCategories.length };
  }

  /**
   * 重新排序分类
   */
  async reorder(userId: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      await this.categoryRepository.update({ id: ids[i], userId }, { sortOrder: i });
    }
    
    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_REORDERED', { ids }, userId);
  }

  /**
   * 创建默认分类
   */
  async createDefaults(userId: string, type: CategoryType): Promise<Category[]> {
    this.logger.log(
      `为用户 ${userId} 创建默认${type === CategoryType.INCOME ? '收入' : '支出'}分类`,
    );

    const existingCategories = await this.categoryRepository.find({
      where: { userId, type, isSystem: false },
    });

    if (existingCategories.length > 0) {
      throw new ConflictException('已存在非系统分类，无需创建默认分类');
    }

    const defaultCategories = this.getDefaultCategories(type);
    const categories: Category[] = [];

    for (const catData of defaultCategories) {
      const category = this.categoryRepository.create({
        ...catData,
        userId,
        isSystem: false,
      });
      categories.push(await this.categoryRepository.save(category));
    }

    return categories;
  }

  /**
   * 检查分类是否为另一分类的子孙
   */
  private isDescendant(category: Category, potentialAncestorId: string): boolean {
    if (category.id === potentialAncestorId) {
      return true;
    }

    if (!category.parent) {
      return false;
    }

    return (
      category.parent.id === potentialAncestorId ||
      this.isDescendant(
        { ...category, parent: category.parent.parent } as Category,
        potentialAncestorId,
      )
    );
  }

  /**
   * 构建树形结构
   */
  private buildTree(categories: Category[]): CategoryTreeNode[] {
    const categoryMap = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    categories.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    categories.forEach((category) => {
      const node = categoryMap.get(category.id)!;
      if (category.parent) {
        const parent = categoryMap.get(category.parent.id);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * 获取默认分类配置
   */
  private getDefaultCategories(type: CategoryType): Partial<Category>[] {
    if (type === CategoryType.INCOME) {
      return [
        { name: '工资', type, color: '#52C41A', icon: 'salary', sortOrder: 0 },
        { name: '奖金', type, color: '#13C2C2', icon: 'bonus', sortOrder: 1 },
        { name: '投资', type, color: '#722ED1', icon: 'investment', sortOrder: 2 },
        { name: '兼职', type, color: '#FA8C16', icon: 'parttime', sortOrder: 3 },
        { name: '礼金', type, color: '#EB2F96', icon: 'gift', sortOrder: 4 },
        { name: '借入款', type, color: '#FAAD14', icon: 'borrow', sortOrder: 5 },
        { name: '其他收入', type, color: '#8C8C8C', icon: 'other', sortOrder: 6 },
      ];
    }

    return [
      { name: '餐饮', type, color: '#FF6B6B', icon: 'food', sortOrder: 0 },
      { name: '购物', type, color: '#4ECDC4', icon: 'shopping', sortOrder: 1 },
      { name: '交通', type, color: '#45B7D1', icon: 'transport', sortOrder: 2 },
      { name: '居住', type, color: '#96CEB4', icon: 'home', sortOrder: 3 },
      { name: '娱乐', type, color: '#FFEAA7', icon: 'entertainment', sortOrder: 4 },
      { name: '通讯', type, color: '#DDA0DD', icon: 'communication', sortOrder: 5 },
      { name: '医疗', type, color: '#FF69B4', icon: 'medical', sortOrder: 6 },
      { name: '教育', type, color: '#98D8C8', icon: 'education', sortOrder: 7 },
      { name: '人情', type, color: '#F7DC6F', icon: 'social', sortOrder: 8 },
      { name: '借出款', type, color: '#722ED1', icon: 'lend', sortOrder: 9 },
      { name: '其他支出', type, color: '#8C8C8C', icon: 'other', sortOrder: 10 },
    ];
  }
}
