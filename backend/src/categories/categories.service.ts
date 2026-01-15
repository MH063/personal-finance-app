import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository, OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { Category, CategoryType } from '../entities/category.entity';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
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
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    private readonly ledgerGateway: LedgerGateway,
  ) {}

  /**
   * 创建分类
   */
  async create(userId: string, createCategoryDto: CreateCategoryDto): Promise<Category> {
    this.logger.log(`用户 ${userId} 创建分类: ${createCategoryDto.name}`);

    // 检查是否存在同名分类 (不区分大小写)
    // 注意：对于中文是精确匹配，对于英文是不区分大小写匹配，使用 LOWER() 可以同时满足
    const existingCategory = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.userId = :userId', { userId })
      .andWhere('category.type = :type', { type: createCategoryDto.type })
      .andWhere('LOWER(category.name) = LOWER(:name)', { name: createCategoryDto.name })
      .getOne();

    if (existingCategory) {
      throw new ConflictException(`该分类已存在，请使用现有分类或输入不同的名称`);
    }

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

    // 检查名称是否重复
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existingCategory = await this.categoryRepository
        .createQueryBuilder('category')
        .where('category.userId = :userId', { userId })
        .andWhere('category.type = :type', { type: category.type })
        .andWhere('LOWER(category.name) = LOWER(:name)', { name: updateCategoryDto.name })
        .getOne();

      if (existingCategory && existingCategory.id !== id) {
        throw new ConflictException(`该分类已存在，请使用现有分类或输入不同的名称`);
      }
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
      throw new OptimisticLockVersionMismatchError(
        'Category',
        updateCategoryDto.version,
        category.version,
      );
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const { version: _version, ...updateData } = updateCategoryDto;
    Object.assign(category, updateData);
    const updatedCategory = await this.categoryRepository.save(category);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'CATEGORY_UPDATED', updatedCategory, userId);

    return updatedCategory;
  }

  /**
   * 删除分类
   */
  async remove(
    userId: string,
    id: string,
    options: { force?: boolean; migrateTo?: string } = {},
  ): Promise<void> {
    this.logger.log(`用户 ${userId} 删除分类: ${id}, options: ${JSON.stringify(options)}`);

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

    // 检查关联交易
    const transactionCount = await this.transactionRepository.count({
      where: { categoryId: id },
    });

    if (transactionCount > 0) {
      if (options.force) {
        this.logger.log(`强制删除分类 ${id} 及其关联的 ${transactionCount} 条交易`);
        await this.transactionRepository.delete({ categoryId: id });
      } else if (options.migrateTo) {
        this.logger.log(`迁移分类 ${id} 的 ${transactionCount} 条交易到 ${options.migrateTo}`);
        // 验证目标分类
        if (options.migrateTo === id) {
          throw new BadRequestException('迁移目标不能是当前分类');
        }
        const targetCategory = await this.findOne(userId, options.migrateTo);
        if (targetCategory.type !== category.type) {
          throw new BadRequestException('迁移目标分类类型必须一致');
        }
        await this.transactionRepository.update(
          { categoryId: id },
          { categoryId: options.migrateTo },
        );
      } else {
        // 返回特定错误格式，以便前端识别并弹出选择框
        // 这里抛出 BadRequestException，message 包含特定关键词或结构
        throw new BadRequestException(
          `该分类下有 ${transactionCount} 条关联交易，请选择强制删除或迁移数据`,
        );
      }
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
    this.ledgerGateway.notifyUpdate(
      null,
      'CATEGORY_BATCH_DELETED',
      { ids: deletableCategories.map((c) => c.id) },
      userId,
    );

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

  /**
   * 归一化分类名称（去除首尾空格，内部空白统一为单个空格，并转小写）
   */
  private normalizeName(name: string): string {
    return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * 查找重复分类
   */
  async findDuplicates(userId: string): Promise<any[]> {
    const categories = await this.categoryRepository.find({
      where: { userId, isSystem: false },
      order: { createdAt: 'ASC' },
    });

    const groups = new Map<string, Category[]>();

    categories.forEach((cat) => {
      const key = `${cat.type}_${this.normalizeName(cat.name)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(cat);
    });

    const duplicates: any[] = [];
    groups.forEach((cats, key) => {
      if (cats.length > 1) {
        duplicates.push({
          key,
          name: cats[0].name,
          type: cats[0].type,
          count: cats.length,
          categories: cats,
        });
      }
    });

    return duplicates;
  }

  /**
   * 清理重复分类 (保留创建时间最早的)
   */
  async cleanupDuplicates(userId: string): Promise<{ deletedCount: number; details: any[] }> {
    const duplicates = await this.findDuplicates(userId);
    let deletedCount = 0;
    const details: any[] = [];

    for (const group of duplicates) {
      // 保留第一个 (最早的，因为查询时按 createdAt ASC 排序)
      const [keep, ...remove] = group.categories;

      if (remove.length > 0) {
        const idsToRemove = remove.map((c: Category) => c.id);

        // 批量删除
        await this.categoryRepository.delete(idsToRemove);

        deletedCount += idsToRemove.length;
        details.push({
          kept: { id: keep.id, name: keep.name },
          removed: idsToRemove,
          type: group.type,
        });

        this.logger.log(
          `自动清理重复分类: 保留 ${keep.name}(${keep.id}), 删除 ${idsToRemove.join(', ')}`,
        );

        // 通知
        this.ledgerGateway.notifyUpdate(
          null,
          'CATEGORY_BATCH_DELETED',
          { ids: idsToRemove },
          userId,
        );
      }
    }

    return { deletedCount, details };
  }

  /**
   * 合并重复分类
   * 策略：
   * 1) 优先保留系统分类（若存在）
   * 2) 否则保留创建时间最早的分类
   * 3) 将交易与预算中引用的重复分类，统一迁移到保留分类
   * 4) 删除重复分类
   */
  async mergeDuplicates(
    userId: string,
    options?: { preferSystem?: boolean },
  ): Promise<{
    mergedGroups: number;
    movedTransactions: number;
    movedBudgets: number;
    deletedCount: number;
    details: Array<{ kept: { id: string; name: string }; removed: string[]; type: string }>;
  }> {
    const { preferSystem = true } = options || {};
    const categories = await this.categoryRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    // 分组（包含系统与非系统，以便优先保留系统分类）
    const groups = new Map<string, Category[]>();
    categories.forEach((cat) => {
      const key = `${cat.type}_${this.normalizeName(cat.name)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(cat);
    });

    let mergedGroups = 0;
    let movedTransactions = 0;
    let movedBudgets = 0;
    let deletedCount = 0;
    const details: Array<{ kept: { id: string; name: string }; removed: string[]; type: string }> =
      [];

    for (const [, cats] of groups) {
      if (cats.length <= 1) continue;
      mergedGroups++;

      // 选择保留者
      let keep: Category | undefined;
      if (preferSystem) {
        keep = cats.find((c) => c.isSystem) || cats[0];
      } else {
        keep = cats[0];
      }
      const remove = cats.filter((c) => c.id !== keep!.id);
      if (remove.length === 0) continue;

      const idsToRemove = remove.map((c: Category) => c.id);

      // 迁移交易记录到保留分类
      for (const rid of idsToRemove) {
        const result = await this.transactionRepository
          .createQueryBuilder()
          .update()
          .set({ categoryId: keep!.id })
          .where('user_id = :userId AND category_id = :rid', { userId, rid })
          .execute();
        movedTransactions += result.affected || 0;
      }

      // 迁移预算到保留分类
      for (const rid of idsToRemove) {
        const result = await this.budgetRepository
          .createQueryBuilder()
          .update()
          .set({ categoryId: keep!.id })
          .where('user_id = :userId AND category_id = :rid', { userId, rid })
          .execute();
        movedBudgets += result.affected || 0;
      }

      // 删除重复分类
      await this.categoryRepository.delete(idsToRemove);
      deletedCount += idsToRemove.length;

      details.push({
        kept: { id: keep!.id, name: keep!.name },
        removed: idsToRemove,
        type: keep!.type,
      });

      this.logger.log(
        `合并重复分类: 保留 ${keep!.name}(${keep!.id}), 删除 ${idsToRemove.join(', ')}, 迁移交易 ${movedTransactions} 条, 迁移预算 ${movedBudgets} 条`,
      );

      // 实时通知
      this.ledgerGateway.notifyUpdate(
        null,
        'CATEGORY_MERGED',
        { keptId: keep!.id, removed: idsToRemove },
        userId,
      );
    }

    return { mergedGroups, movedTransactions, movedBudgets, deletedCount, details };
  }
}
