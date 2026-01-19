import { Module } from '@nestjs/common';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { AiDiagnosisController } from './ai-diagnosis.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [AiDiagnosisController],
  providers: [AiDiagnosisService],
})
export class AiDiagnosisModule {}
