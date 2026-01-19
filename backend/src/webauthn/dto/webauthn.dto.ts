import { IsString, IsOptional, IsArray, IsNumber, IsObject } from 'class-validator';

export class RegisterCredentialDto {
  @IsString()
  challenge: string;

  @IsString()
  credentialId: string;

  @IsObject()
  publicKeyJwk: any;

  @IsOptional()
  @IsNumber()
  signCount?: number;

  @IsOptional()
  @IsArray()
  transports?: string[];

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class ChallengeResponse {
  challenge: string;
  rpId: string;
  userId: string;
  username?: string;
  displayName?: string;
}

export class AssertionOptionsQueryDto {
  @IsString()
  username: string;
}

export class VerifyAssertionDto {
  @IsString()
  username: string;

  @IsString()
  credentialId: string;

  @IsString()
  clientDataJSON: string;

  @IsString()
  authenticatorData: string;

  @IsString()
  signature: string;
}
