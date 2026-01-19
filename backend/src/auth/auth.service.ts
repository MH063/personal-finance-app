import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { User, UserStatus } from '../entities/user.entity';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { UserSetting, ThemeMode, Currency } from '../entities/user-setting.entity';

export interface JwtPayload {
  sub: string;
  username: string;
  email: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthResponse {
  user: Partial<User>;
  tokens: TokenResponse;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 用户注册
   */
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    this.logger.log(`开始处理用户注册: ${registerDto.username}`);

    const existingUser = await this.userRepository.findOne({
      where: [{ username: registerDto.username }, { email: registerDto.email }],
    });

    if (existingUser) {
      if (existingUser.username === registerDto.username) {
        throw new ConflictException('用户名已存在');
      }
      throw new ConflictException('邮箱已被注册');
    }

    const user = this.userRepository.create({
      username: registerDto.username,
      email: registerDto.email,
      password: registerDto.password,
      fullName: registerDto.fullName,
      status: UserStatus.ACTIVE,
    });

    try {
      await this.userRepository.save(user);
      this.logger.log(`用户注册成功: ${user.id}`);

      // 创建默认设置
      await this.createDefaultSettings(user.id);

      const tokens = await this.generateTokens(user);
      return {
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (error) {
      if (error instanceof QueryFailedError && (error as any).code === '23505') {
        throw new ConflictException('数据约束冲突，请检查输入');
      }
      throw error;
    }
  }

  /**
   * 用户登录
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`用户登录尝试: ${loginDto.username}`);

    const user = await this.findUserByUsername(loginDto.username);

    if (user.isLocked()) {
      throw new UnauthorizedException('账户已被锁定，请稍后再试');
    }

    const isPasswordValid = await user.validatePassword(loginDto.password);

    if (!isPasswordValid) {
      user.incrementLoginAttempts();
      await this.userRepository.save(user);
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`账户状态异常: ${user.status}`);
    }

    user.resetLoginAttempts();
    user.lastLogin = new Date();
    await this.userRepository.save(user);

    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * 刷新令牌
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<TokenResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshTokenDto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub, status: UserStatus.ACTIVE },
      });

      if (!user) {
        throw new UnauthorizedException('无效的刷新令牌');
      }

      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
  }

  /**
   * 更改密码
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'status'],
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('账户状态异常');
    }

    const isPasswordValid = await user.validatePassword(changePasswordDto.currentPassword);

    if (!isPasswordValid) {
      throw new BadRequestException('当前密码不正确');
    }

    user.password = changePasswordDto.newPassword;
    await this.userRepository.save(user);

    this.logger.log(`用户密码已更改: ${userId}`);
    return { message: '密码更改成功' };
  }

  /**
   * 更新用户资料
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: updateProfileDto.email },
      });
      if (existingEmail) {
        throw new ConflictException('邮箱已被其他账户使用');
      }
      user.email = updateProfileDto.email;
    }

    if (updateProfileDto.fullName) {
      user.fullName = updateProfileDto.fullName;
    }

    if (updateProfileDto.avatar) {
      user.avatar = updateProfileDto.avatar;
    }

    await this.userRepository.save(user);
    this.logger.log(`用户资料已更新: ${userId}`);

    return this.sanitizeUser(user);
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    return this.sanitizeUser(user);
  }

  /**
   * 登出（可记录日志）
   */
  async logout(userId: string): Promise<{ message: string }> {
    this.logger.log(`用户登出: ${userId}`);
    return { message: '登出成功' };
  }

  async issueTokensForUser(userId: string): Promise<AuthResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId, status: UserStatus.ACTIVE },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    user.lastLogin = new Date();
    await this.userRepository.save(user);
    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * 删除账户
   */
  async deleteAccount(userId: string, password: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'status'],
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const isPasswordValid = await user.validatePassword(password);

    if (!isPasswordValid) {
      throw new BadRequestException('密码不正确');
    }

    await this.userRepository.remove(user);
    this.logger.log(`用户账户已删除: ${userId}`);

    return { message: '账户已成功删除' };
  }

  /**
   * 通过用户名查找用户
   */
  private async findUserByUsername(username: string): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username })
      .orWhere('user.email = :username', { username })
      .addSelect('user.password')
      .getOne();

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return user;
  }

  /**
   * 生成访问令牌和刷新令牌
   */
  private async generateTokens(user: User): Promise<TokenResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRATION || '7d',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRATION || '30d',
      }),
    ]);

    const expiresIn = this.parseExpiresIn(process.env.JWT_EXPIRATION || '7d');

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * 解析过期时间（秒）
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 7 * 24 * 60 * 60;
    }
  }

  /**
   * 创建用户默认设置
   */
  private async createDefaultSettings(userId: string): Promise<void> {
    const settings = this.userSettingRepository.create({
      userId,
      theme: ThemeMode.SYSTEM,
      currency: Currency.CNY,
      language: 'zh-CN',
      dateFormat: 'YYYY-MM-DD',
      firstDayOfWeek: 0,
      decimalPlaces: 2,
      notificationSettings: {
        debtReminder: true,
        budgetAlert: true,
        weeklyReport: false,
        monthlyReport: true,
        reminderAdvanceDays: 3,
      },
      defaultPaymentMethod: 'wechat',
      quickAddEnabled: true,
      dataReminderEnabled: true,
      dataReminderTime: '20:00',
    });

    await this.userSettingRepository.save(settings);
  }

  // 默认账本逻辑已移除

  /**
   * 清理用户敏感信息
   */
  private sanitizeUser(user: User): Partial<User> {
    const sanitizedUser: Record<string, any> = { ...(user as any) };
    delete (sanitizedUser as any).password;
    delete (sanitizedUser as any).loginAttempts;
    delete (sanitizedUser as any).lockUntil;
    return sanitizedUser;
  }
}
