import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiDiagnosisService } from './ai-diagnosis.service';

@ApiTags('AI 财务诊断')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-diagnosis')
export class AiDiagnosisController {
  constructor(private readonly aiDiagnosisService: AiDiagnosisService) {}

  @Get()
  @ApiOperation({ summary: '获取 AI 财务诊断建议' })
  async getDiagnosis(@Request() req: any) {
    const result = await this.aiDiagnosisService.diagnose(req.user.id);
    return {
      success: true,
      data: result,
    };
  }
}
