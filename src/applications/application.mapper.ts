import type {
  ApplicationDto,
  ApplicationSummaryDto,
  RiskAssessmentResponseDto,
} from '@/applications/dto/application-response.dto';
import type { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { maskNationalId } from '@/common/masking/masking';
import type { RiskAssessment } from '@/risk/risk-assessment.entity';
import { toUserRef } from '@/users/dto/user.dto';
import { UserRole } from '@/users/user-role.enum';

/**
 * Entity -> API response. The only place that decides what leaves the API:
 * - national IDs only as •••••6789
 * - SALES see the risk level, but not the score, reasons or errors
 */

const byDate = (a: { createdAt: Date }, b: { createdAt: Date }) =>
  a.createdAt.getTime() - b.createdAt.getTime();

const toRiskAssessmentDto = (
  assessment: RiskAssessment,
  viewer: UserRole,
): RiskAssessmentResponseDto => {
  const dto: RiskAssessmentResponseDto = {
    submissionNumber: assessment.submissionNumber,
    status: assessment.status,
    riskLevel: assessment.riskLevel,
    attempts: assessment.attempts,
    completedAt: assessment.completedAt,
  };
  if (viewer !== UserRole.SALES) {
    dto.riskScore = assessment.riskScore;
    dto.reasons = assessment.reasons;
    dto.lastError = assessment.lastError;
  }
  return dto;
};

const requireLoaded = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`Relation "${name}" was not loaded`);
  }
  return value;
};

export const toApplicationSummary = (
  app: MerchantApplication,
): ApplicationSummaryDto => ({
  id: app.id,
  businessName: app.businessName,
  status: app.status,
  riskStatus: app.riskStatus,
  riskLevel: app.riskLevel,
  createdBy: toUserRef(requireLoaded(app.createdBy, 'createdBy')),
  assignedReviewer: app.assignedReviewer
    ? toUserRef(app.assignedReviewer)
    : null,
  submissionCount: app.submissionCount,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt,
});

export const toApplicationDetail = (
  app: MerchantApplication,
  viewer: UserRole,
): ApplicationDto => ({
  id: app.id,
  businessName: app.businessName,
  status: app.status,
  riskStatus: app.riskStatus,
  riskLevel: app.riskLevel,
  createdBy: toUserRef(requireLoaded(app.createdBy, 'createdBy')),
  assignedReviewer: app.assignedReviewer
    ? toUserRef(app.assignedReviewer)
    : null,
  submissionCount: app.submissionCount,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt,
  legalBusinessName: app.legalBusinessName,
  businessType: app.businessType,
  industry: app.industry,
  registrationNumber: app.registrationNumber,
  processing: {
    expectedMonthlyVolumeMinor: app.expectedMonthlyVolumeMinor,
    averageTransactionMinor: app.averageTransactionMinor,
    currency: app.currency,
    channels: app.processingChannels,
  },
  owners: [...requireLoaded(app.owners, 'owners')]
    .sort(byDate)
    .map((owner) => ({
      id: owner.id,
      fullName: owner.fullName,
      email: owner.email,
      phone: owner.phone,
      ownershipPercent: owner.ownershipPercent,
      isPrimaryContact: owner.isPrimaryContact,
      nationalIdMasked: maskNationalId(owner.nationalIdLast4),
    })),
  riskAssessments: [...requireLoaded(app.riskAssessments, 'riskAssessments')]
    .sort((a, b) => a.submissionNumber - b.submissionNumber)
    .map((assessment) => toRiskAssessmentDto(assessment, viewer)),
  decisions: [...requireLoaded(app.decisions, 'decisions')]
    .sort(byDate)
    .map((decision) => ({
      id: decision.id,
      decision: decision.decision,
      note: decision.note,
      submissionNumber: decision.submissionNumber,
      riskLevelAtDecision: decision.riskLevelAtDecision,
      reviewer: toUserRef(
        requireLoaded(decision.reviewer, 'decisions.reviewer'),
      ),
      createdAt: decision.createdAt,
    })),
  submittedAt: app.submittedAt,
  decidedAt: app.decidedAt,
});
