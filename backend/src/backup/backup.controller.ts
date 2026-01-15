import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  ParseUUIDPipe,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { BackupService } from './backup.service';
import {
  CreateBackupDto,
  RestoreBackupDto,
  BackupQueryDto,
  CleanupBackupDto,
} from './dto/backup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('备份')
@Controller('backup')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('create')
  @ApiOperation({ summary: '创建备份' })
  @ApiResponse({ status: 201, description: '备份创建成功' })
  async create(@Request() req: any, @Body() dto: CreateBackupDto) {
    return this.backupService.createBackup(req.user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: '获取备份历史' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getHistory(@Request() req: any, @Query() query: BackupQueryDto) {
    return this.backupService.getBackupHistory(req.user.id, query.successfulOnly);
  }

  @Get(':id/download')
  @ApiOperation({ summary: '下载备份文件' })
  @ApiResponse({ status: 200, description: '下载成功' })
  async download(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filePath, fileName, fileSize, checksum } =
      await this.backupService.getBackupDownloadInfo(req.user.id, id);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', fileSize.toString());
    res.setHeader('X-Checksum', checksum || '');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Length, X-Checksum',
    );

    const file = createReadStream(filePath);
    return new StreamableFile(file);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '恢复备份' })
  @ApiResponse({ status: 200, description: '恢复成功' })
  async restore(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreBackupDto,
  ) {
    return this.backupService.restoreBackup(req.user.id, { ...dto, backupId: id });
  }

  @Post('upload-restore')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传并恢复备份' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        password: { type: 'string' },
      },
    },
  })
  async uploadAndRestore(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body('password') password?: string,
  ) {
    return this.backupService.uploadAndRestore(req.user.id, file, password);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除备份' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.backupService.deleteBackup(req.user.id, id);
  }

  @Post('cleanup')
  @ApiOperation({ summary: '清理旧备份' })
  @ApiResponse({ status: 200, description: '清理成功' })
  async cleanup(@Request() req: any, @Body() dto: CleanupBackupDto) {
    return this.backupService.cleanupOldBackups(req.user.id, dto);
  }
}
