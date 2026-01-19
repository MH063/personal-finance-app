import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnService } from './webauthn.service';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSetting]), AuthModule],
  controllers: [WebAuthnController],
  providers: [WebAuthnService],
  exports: [WebAuthnService],
})
export class WebAuthnModule {}
