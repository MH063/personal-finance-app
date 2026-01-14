import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType } from '../../entities/category.entity';

export class CreateCategoryDto {
  @ApiProperty({ example: '餐饮', description: '分类名称' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ enum: CategoryType, example: CategoryType.EXPENSE, description: '分类类型' })
  @IsEnum(CategoryType)
  type: CategoryType;

  @ApiPropertyOptional({ description: '父级分类ID（用于创建子分类）' })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ example: 'food', description: '分类图标' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: '#FF6B6B', description: '分类颜色（十六进制）' })
  @IsString()
  @MaxLength(7)
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: '排序序号', default: 0 })
  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: '餐饮美食' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(7)
  @IsOptional()
  color?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '版本号' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class CategoryQueryDto {
  @ApiPropertyOptional({ enum: CategoryType, description: '按类型筛选' })
  @IsEnum(CategoryType)
  @IsOptional()
  type?: CategoryType;

  @ApiPropertyOptional({ description: '是否包含子分类', default: true })
  @IsOptional()
  includeChildren?: boolean = true;
}

export class ReorderCategoriesDto {
  @ApiProperty({ description: '分类ID列表（按排序顺序）' })
  @IsUUID('4', { each: true })
  ids: string[];
}

export class CreateDefaultCategoriesDto {
  @ApiProperty({ enum: CategoryType, description: '要创建的默认分类类型' })
  @IsEnum(CategoryType)
  type: CategoryType;
}
