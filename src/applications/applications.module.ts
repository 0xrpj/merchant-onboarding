import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationLifecycleService } from '@/applications/application-lifecycle.service';
import { ApplicationsController } from '@/applications/applications.controller';
import { ApplicationsRepository } from '@/applications/applications.repository';
import { ApplicationsService } from '@/applications/applications.service';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import { ReviewDecision } from '@/applications/entities/review-decision.entity';
import { AuditModule } from '@/audit/audit.module';
import { CryptoModule } from '@/crypto/crypto.module';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import { RiskQueueModule } from '@/risk/risk-queue.module';
import { UsersModule } from '@/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MerchantApplication,
      MerchantOwner,
      ReviewDecision,
      RiskAssessment,
    ]),
    UsersModule,
    AuditModule,
    CryptoModule,
    RiskQueueModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsRepository,
    ApplicationsService,
    ApplicationLifecycleService,
  ],
})
export class ApplicationsModule {}
