import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user001', description: '用户名' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'user@example.com', description: '邮箱地址' })
  @IsEmail()
  @MaxLength(100)
  email: string;

  @ApiProperty({ example: 'Password123!', description: '密码（至少8位，包含大小写字母和数字）' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: '密码必须包含大小写字母和数字，且至少8位',
  })
  password: string;

  @ApiPropertyOptional({ example: '张三', description: '真实姓名' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  fullName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user001', description: '用户名或邮箱' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Password123!', description: '密码' })
  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '刷新令牌' })
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: '新密码必须包含大小写字母和数字，且至少8位',
  })
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '李四', description: '真实姓名' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: 'newemail@example.com', description: '新邮箱' })
  @IsEmail()
  @MaxLength(100)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class AssignDefaultCategoriesDto {
  @ApiPropertyOptional({ description: '如果分类不存在是否创建示例分类', default: true })
  createDefaults?: boolean;
}
