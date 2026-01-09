import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { BackupLog, BackupType } from '../entities/backup-log.entity';
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt } from '../entities/debt.entity';
import { CreateBackupDto, RestoreBackupDto, CleanupBackupDto } from './dto/backup.dto';

export interface BackupResult {
  success: boolean;
  fileName: string;
  filePath: string;
  fileSize: number;
  recordCount: number;
  checksum: string;
  errorMessage?: string;
}

export interface BackupData {
  version: string;
  backupType: BackupType;
  createdAt: string;
  userId: string;
  data: {
    transactions?: Transaction[];
    categories?: Category[];
    debts?: Debt[];
  };
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupPath: string;
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(BackupLog)
    private readonly backupLogRepository: Repository<BackupLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    private readonly configService: ConfigService,
  ) {
    this.backupPath = this.configService.get<string>('BACKUP_PATH', './backups');
    this.encryptionKey = this.configService.get<string>(
      'BACKUP_ENCRYPTION_KEY',
      'default-backup-key-32chars!',
    );

    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  /**
   * 创建备份
   */
  async createBackup(userId: string, dto: CreateBackupDto): Promise<BackupLog> {
    this.logger.log(`用户 ${userId} 开始创建备份: ${dto.backupType}`);

    const startTime = Date.now();
    let result: BackupResult;

    try {
      const backupData = await this.collectBackupData(userId, dto.backupType || BackupType.FULL);
      result = await this.saveBackupFile(userId, backupData, dto.encrypt || false);

      const backupLog = this.backupLogRepository.create({
        userId,
        backupType: dto.backupType,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        isEncrypted: dto.encrypt || false,
        recordCount: result.recordCount,
        checksum: result.checksum,
        isSuccess: true,
      });

      const savedLog = await this.backupLogRepository.save(backupLog);

      const elapsed = (Date.now() - startTime) / 1000;
      this.logger.log(`备份创建成功: ${result.fileName} (${result.fileSize} bytes, ${elapsed}s)`);

      return savedLog;
    } catch (error: any) {
      this.logger.error(`备份创建失败: ${error.message}`);

      const failedLog = this.backupLogRepository.create({
        userId,
        backupType: dto.backupType,
        fileName: '',
        isSuccess: false,
        errorMessage: error.message,
      });

      return this.backupLogRepository.save(failedLog);
    }
  }

  /**
   * 获取备份历史
   */
  async getBackupHistory(userId: string, successfulOnly: boolean = true) {
    const queryBuilder = this.backupLogRepository
      .createQueryBuilder('backup')
      .where('backup.userId = :userId', { userId })
      .orderBy('backup.createdAt', 'DESC');

    if (successfulOnly) {
      queryBuilder.andWhere('backup.isSuccess = :success', { success: true });
    }

    return queryBuilder.getMany();
  }

  /**
   * 下载备份文件
   */
  async downloadBackup(
    userId: string,
    backupId: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const backupLog = await this.backupLogRepository.findOne({
      where: { id: backupId, userId },
    });

    if (!backupLog) {
      throw new NotFoundException('备份记录不存在');
    }

    if (!backupLog.isSuccess) {
      throw new BadRequestException('该备份文件无效');
    }

    if (!fs.existsSync(backupLog.filePath)) {
      throw new NotFoundException('备份文件已丢失');
    }

    return {
      filePath: backupLog.filePath,
      fileName: backupLog.fileName,
    };
  }

  /**
   * 恢复备份
   */
  async restoreBackup(userId: string, dto: RestoreBackupDto): Promise<{ restoredCount: number }> {
    this.logger.log(`用户 ${userId} 开始恢复备份: ${dto.backupId}`);

    const backupLog = await this.backupLogRepository.findOne({
      where: { id: dto.backupId, userId },
    });

    if (!backupLog) {
      throw new NotFoundException('备份记录不存在');
    }

    if (!fs.existsSync(backupLog.filePath)) {
      throw new NotFoundException('备份文件已丢失');
    }

    const fileContent = fs.readFileSync(backupLog.filePath, 'utf-8');
    let backupData: BackupData;

    try {
      if (backupLog.isEncrypted) {
        const decrypted = this.decryptData(fileContent, dto.password);
        backupData = JSON.parse(decrypted);
      } else {
        backupData = JSON.parse(fileContent);
      }
    } catch (error: any) {
      throw new BadRequestException('备份文件解析失败，可能是密码错误或文件损坏');
    }

    let restoredCount = 0;

    if (backupData.data.transactions) {
      for (const tx of backupData.data.transactions) {
        tx.userId = userId;
        tx.id = uuidv4();
        await this.transactionRepository.save(tx);
        restoredCount++;
      }
    }

    if (backupData.data.categories) {
      for (const cat of backupData.data.categories) {
        cat.userId = userId;
        cat.id = uuidv4();
        await this.categoryRepository.save(cat);
        restoredCount++;
      }
    }

    if (backupData.data.debts) {
      for (const debt of backupData.data.debts) {
        debt.userId = userId;
        debt.id = uuidv4();
        await this.debtRepository.save(debt);
        restoredCount++;
      }
    }

    this.logger.log(`备份恢复完成: 恢复 ${restoredCount} 条记录`);
    return { restoredCount };
  }

  /**
   * 上传并恢复备份
   */
  async uploadAndRestore(userId: string, file: any, password?: string): Promise<{ restoredCount: number }> {
    this.logger.log(`用户 ${userId} 开始上传并恢复备份`);

    const fileContent = file.buffer.toString('utf8');
    let backupData: BackupData;

    try {
      // 尝试解析 JSON，如果失败则可能是加密的
      try {
        backupData = JSON.parse(fileContent);
      } catch (e) {
        const decrypted = this.decryptData(fileContent, password);
        backupData = JSON.parse(decrypted);
      }
    } catch (error: any) {
      throw new BadRequestException('备份文件解析失败，可能是文件损坏或加密格式不正确');
    }

    // 基础验证
    if (!backupData.version || !backupData.data) {
      throw new BadRequestException('无效的备份文件格式');
    }

    let restoredCount = 0;

    // 这里复用 restoreBackup 的核心数据恢复逻辑
    // 为了简单起见，我们直接处理数据
    if (backupData.data.transactions) {
      for (const tx of backupData.data.transactions) {
        const { id, ...txData } = tx;
        await this.transactionRepository.save({
          ...txData,
          userId,
          id: uuidv4(),
        });
        restoredCount++;
      }
    }

    if (backupData.data.categories) {
      for (const cat of backupData.data.categories) {
        const { id, ...catData } = cat;
        await this.categoryRepository.save({
          ...catData,
          userId,
          id: uuidv4(),
        });
        restoredCount++;
      }
    }

    if (backupData.data.debts) {
      for (const debt of backupData.data.debts) {
        const { id, ...debtData } = debt;
        await this.debtRepository.save({
          ...debtData,
          userId,
          id: uuidv4(),
        });
        restoredCount++;
      }
    }

    this.logger.log(`上传恢复完成: 恢复 ${restoredCount} 条记录`);
    return { restoredCount };
  }

  /**
   * 删除备份
   */
  async deleteBackup(userId: string, backupId: string): Promise<void> {
    const backupLog = await this.backupLogRepository.findOne({
      where: { id: backupId, userId },
    });

    if (!backupLog) {
      throw new NotFoundException('备份记录不存在');
    }

    if (backupLog.filePath && fs.existsSync(backupLog.filePath)) {
      fs.unlinkSync(backupLog.filePath);
    }

    await this.backupLogRepository.remove(backupLog);
    this.logger.log(`备份删除成功: ${backupId}`);
  }

  /**
   * 清理旧备份
   */
  async cleanupOldBackups(
    userId: string,
    dto: CleanupBackupDto,
  ): Promise<{ deletedCount: number }> {
    const queryBuilder = this.backupLogRepository
      .createQueryBuilder('backup')
      .where('backup.userId = :userId', { userId })
      .andWhere('backup.isSuccess = :success', { success: true })
      .orderBy('backup.createdAt', 'DESC');

    if (dto.olderThan) {
      queryBuilder.andWhere('backup.createdAt < :olderThan', {
        olderThan: new Date(dto.olderThan),
      });
    }

    const backups = await queryBuilder.getMany();

    let backupsToDelete = backups;
    if (dto.keepCount && dto.keepCount > 0) {
      backupsToDelete = backups.slice(dto.keepCount);
    }

    for (const backup of backupsToDelete) {
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath);
      }
      await this.backupLogRepository.remove(backup);
    }

    this.logger.log(`清理备份完成: 删除 ${backupsToDelete.length} 个旧备份`);
    return { deletedCount: backupsToDelete.length };
  }

  /**
   * 收集备份数据
   */
  private async collectBackupData(userId: string, backupType: BackupType): Promise<BackupData> {
    const data: BackupData = {
      version: '1.0.0',
      backupType,
      createdAt: new Date().toISOString(),
      userId,
      data: {},
    };

    if (backupType === BackupType.FULL || backupType === BackupType.TRANSACTIONS) {
      data.data.transactions = await this.transactionRepository.find({
        where: { userId, isDeleted: false },
        relations: ['category'],
      });
    }

    if (backupType === BackupType.FULL || backupType === BackupType.CATEGORIES) {
      data.data.categories = await this.categoryRepository.find({
        where: { userId },
        relations: ['parent'],
      });
    }

    if (backupType === BackupType.FULL || backupType === BackupType.DEBTS) {
      data.data.debts = await this.debtRepository.find({
        where: { userId },
        relations: ['payments'],
      });
    }

    return data;
  }

  /**
   * 保存备份文件
   */
  private async saveBackupFile(
    userId: string,
    data: BackupData,
    encrypt: boolean,
  ): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${userId}_${data.backupType}_${timestamp}.json`;
    const filePath = path.join(this.backupPath, fileName);

    let content = JSON.stringify(data, null, 2);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    if (encrypt) {
      content = this.encryptData(content);
    }

    fs.writeFileSync(filePath, content);

    const stats = fs.statSync(filePath);

    const recordCount =
      (data.data.transactions?.length || 0) +
      (data.data.categories?.length || 0) +
      (data.data.debts?.length || 0);

    return {
      success: true,
      fileName,
      filePath,
      fileSize: stats.size,
      recordCount,
      checksum,
    };
  }

  /**
   * 加密数据
   */
  private encryptData(data: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密数据
   */
  private decryptData(encryptedData: string, password?: string): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
