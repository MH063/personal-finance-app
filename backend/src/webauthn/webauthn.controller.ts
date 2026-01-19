import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WebAuthnService } from './webauthn.service';
import { RegisterCredentialDto, VerifyAssertionDto } from './dto/webauthn.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('WebAuthn')
@Controller('webauthn')
export class WebAuthnController {
  constructor(private readonly webAuthnService: WebAuthnService) {}

  @Get('challenge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成WebAuthn挑战' })
  async challenge(@Request() req: any) {
    return this.webAuthnService.generateChallenge(req.user.id);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '注册并存储WebAuthn凭证' })
  async register(@Request() req: any, @Body() dto: RegisterCredentialDto) {
    return this.webAuthnService.registerCredential(req.user.id, dto);
  }

  @Get('credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出当前用户的WebAuthn凭证' })
  async list(@Request() req: any) {
    return this.webAuthnService.listCredentials(req.user.id);
  }

  @Delete('credentials/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除指定WebAuthn凭证' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.webAuthnService.deleteCredential(req.user.id, id);
  }

  @Get('assertion-options')
  @ApiOperation({ summary: '生成登录断言选项' })
  async assertionOptions(@Query('username') username: string) {
    return this.webAuthnService.generateAssertionOptions(username);
  }

  @Post('assertion-verify')
  @ApiOperation({ summary: '验证登录断言并发放令牌' })
  async assertionVerify(@Body() dto: VerifyAssertionDto) {
    return this.webAuthnService.verifyAssertion(dto);
  }
}
