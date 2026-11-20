import { Module } from '@nestjs/common';
import { AuditModule } from '@/audit/audit.module';
import { CryptoModule } from '@/crypto/crypto.module';
import { KYB_PROVIDER } from '@/risk/kyb/kyb-provider';
import { SimulatedKybProvider } from '@/risk/kyb/simulated-kyb.provider';
import { RiskAssessmentService } from '@/risk/risk-assessment.service';
import { RiskQueueModule } from '@/risk/risk-queue.module';
import { RiskProcessor } from '@/risk/risk.processor';

/**
 * The background worker. Runs inside the API process (RUN_RISK_WORKER=true,
 * handy for development and tests) or as its own process (src/worker.ts).
 */
@Module({
  imports: [RiskQueueModule, AuditModule, CryptoModule],
  providers: [
    RiskProcessor,
    RiskAssessmentService,
    // The provider behind an interface: a real KYB client would replace this line.
    { provide: KYB_PROVIDER, useClass: SimulatedKybProvider },
  ],
  exports: [RiskAssessmentService],
})
export class RiskWorkerModule {}
