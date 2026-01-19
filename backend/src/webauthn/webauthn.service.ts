import {
  Injectable,
  BadRequestException,
  Logger,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { RegisterCredentialDto, ChallengeResponse, VerifyAssertionDto } from './dto/webauthn.dto';
import { ConfigService } from '@nestjs/config';
import { getPrimaryIP } from '../common/utils/ip.util';
import { randomBytes, createPublicKey, createVerify, createHash } from 'crypto';
import Redis from 'ioredis';
import { AuthService, AuthResponse } from '../auth/auth.service';

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly authService: AuthService,
  ) {}

  async generateChallenge(userId: string): Promise<ChallengeResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'username', 'fullName'],
    });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const challenge = randomBytes(32).toString('base64url');
    const rpId = this.configService.get<string>('WEBAUTHN_RP_ID') || getPrimaryIP();

    await this.redis.setex(`webauthn:challenge:${userId}`, 300, challenge);
    this.logger.log(`生成WebAuthn挑战: ${userId}`);

    return {
      challenge,
      rpId,
      userId: user.id,
      username: user.username,
      displayName: user.fullName,
    };
  }

  async registerCredential(userId: string, dto: RegisterCredentialDto): Promise<{ id: string }> {
    const storedChallenge = await this.redis.get(`webauthn:challenge:${userId}`);
    if (!storedChallenge) {
      throw new BadRequestException('挑战已过期或不存在');
    }
    if (storedChallenge !== dto.challenge) {
      throw new BadRequestException('挑战验证失败');
    }
    await this.redis.del(`webauthn:challenge:${userId}`);

    let settings = await this.userSettingRepository.findOne({ where: { userId } });
    if (!settings) {
      settings = this.userSettingRepository.create({
        userId,
        theme: 'system' as any,
        currency: 'CNY' as any,
        language: 'zh-CN',
        dateFormat: 'YYYY-MM-DD',
        firstDayOfWeek: 0,
        decimalPlaces: 2,
        quickAddEnabled: true,
        dataReminderEnabled: true,
        dataReminderTime: '20:00',
      });
    }

    const credentials = Array.isArray(settings.webauthnCredentials)
      ? settings.webauthnCredentials
      : [];

    const newCredential = {
      id: dto.credentialId,
      publicKeyJwk: dto.publicKeyJwk,
      signCount: dto.signCount,
      transports: dto.transports,
      deviceName: dto.deviceName,
      userAgent: dto.userAgent,
      createdAt: new Date().toISOString(),
    };

    if (credentials.find((c) => c.id === newCredential.id)) {
      throw new BadRequestException('该凭证已存在');
    }

    credentials.push(newCredential);
    settings.webauthnCredentials = credentials;
    await this.userSettingRepository.save(settings);
    this.logger.log(`保存WebAuthn凭证: ${userId}`);

    return { id: newCredential.id };
  }

  async listCredentials(userId: string): Promise<
    Array<{
      id: string;
      deviceName?: string;
      createdAt: string;
      transports?: string[];
    }>
  > {
    const settings = await this.userSettingRepository.findOne({ where: { userId } });
    const credentials = settings?.webauthnCredentials || [];
    return credentials.map((c) => ({
      id: c.id,
      deviceName: c.deviceName,
      createdAt: c.createdAt,
      transports: c.transports,
    }));
  }

  async deleteCredential(userId: string, credentialId: string): Promise<{ removed: boolean }> {
    const settings = await this.userSettingRepository.findOne({ where: { userId } });
    if (!settings || !settings.webauthnCredentials) {
      return { removed: false };
    }
    const before = settings.webauthnCredentials.length;
    settings.webauthnCredentials = settings.webauthnCredentials.filter(
      (c) => c.id !== credentialId,
    );
    const after = settings.webauthnCredentials.length;
    await this.userSettingRepository.save(settings);
    this.logger.log(`删除WebAuthn凭证: ${userId} -> ${credentialId}`);
    return { removed: before !== after };
  }

  private decodeBase64url(input: string): Buffer {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 2 ? '==' : normalized.length % 4 === 3 ? '=' : '';
    return Buffer.from(normalized + pad, 'base64');
  }

  async generateAssertionOptions(username: string): Promise<{
    challenge: string;
    rpId: string;
    userId: string;
    allowCredentials: Array<{ id: string; transports?: string[] }>;
  }> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username })
      .orWhere('user.email = :username', { username })
      .select(['user.id', 'user.username'])
      .getOne();
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const settings = await this.userSettingRepository.findOne({ where: { userId: user.id } });
    const credentials = settings?.webauthnCredentials || [];
    if (credentials.length === 0) {
      throw new BadRequestException('该用户没有可用的WebAuthn凭证');
    }

    const challenge = randomBytes(32).toString('base64url');
    const rpId = this.configService.get<string>('WEBAUTHN_RP_ID') || getPrimaryIP();
    await this.redis.setex(`webauthn:assertion:${user.id}`, 300, challenge);
    this.logger.log(`生成WebAuthn断言挑战: ${user.id}`);

    return {
      challenge,
      rpId,
      userId: user.id,
      allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports })),
    };
  }

  async verifyAssertion(dto: VerifyAssertionDto): Promise<AuthResponse> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username: dto.username })
      .orWhere('user.email = :username', { username: dto.username })
      .getOne();
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const storedChallenge = await this.redis.get(`webauthn:assertion:${user.id}`);
    if (!storedChallenge) {
      throw new BadRequestException('挑战已过期或不存在');
    }

    const clientDataBuf = this.decodeBase64url(dto.clientDataJSON);
    let clientData: any;
    try {
      clientData = JSON.parse(clientDataBuf.toString('utf-8'));
    } catch (_e) {
      throw new BadRequestException('客户端数据解析失败');
    }

    const clientChallenge: string = clientData?.challenge || '';
    if (!clientChallenge) {
      throw new BadRequestException('客户端未提供挑战');
    }
    if (clientChallenge !== storedChallenge) {
      const normalized = Buffer.isBuffer(this.decodeBase64url(clientChallenge))
        ? Buffer.from(this.decodeBase64url(clientChallenge)).toString('base64url')
        : clientChallenge;
      if (normalized !== storedChallenge) {
        throw new UnauthorizedException('挑战校验失败');
      }
    }
    if (clientData?.type !== 'webauthn.get') {
      throw new BadRequestException('断言类型无效');
    }

    const settings = await this.userSettingRepository.findOne({ where: { userId: user.id } });
    const credentials = settings?.webauthnCredentials || [];
    const credential = credentials.find((c) => c.id === dto.credentialId);
    if (!credential) {
      throw new UnauthorizedException('凭证不存在');
    }

    const authDataBuf = this.decodeBase64url(dto.authenticatorData);
    const signatureBuf = this.decodeBase64url(dto.signature);
    const hash = createHash('sha256').update(clientDataBuf).digest();
    const toBeSigned = Buffer.concat([authDataBuf, hash]);

    let key;
    try {
      key = createPublicKey({ key: credential.publicKeyJwk, format: 'jwk' });
    } catch (_e) {
      throw new BadRequestException('服务器无法解析凭证公钥');
    }

    const verifier = createVerify('SHA256');
    verifier.update(toBeSigned);
    verifier.end();
    const valid = verifier.verify(key, signatureBuf);
    if (!valid) {
      throw new UnauthorizedException('签名验证失败');
    }

    await this.redis.del(`webauthn:assertion:${user.id}`);
    this.logger.log(`登录断言验证成功: ${user.id}`);
    return this.authService.issueTokensForUser(user.id);
  }
}
