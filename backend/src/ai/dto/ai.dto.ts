import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class BatchPredictDto {
  @ApiProperty({ description: '交易描述列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  descriptions: string[];
}
