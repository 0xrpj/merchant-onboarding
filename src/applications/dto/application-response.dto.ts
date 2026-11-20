import {
  ApplicationStatus,
  BusinessType,
  DecisionType,
  Industry,
  ProcessingChannel,
  RiskLevel,
  RiskStatus,
} from '@/applications/application.enums';
import { PageMetaDto } from '@/common/pagination/pagination.dto';
import { RiskAssessmentStatus } from '@/risk/risk-assessment-status.enum';
import { UserRefDto } from '@/users/dto/user.dto';

export class ProcessingResponseDto {
  expectedMonthlyVolumeMinor: number;
  averageTransactionMinor: number;
  currency: string;
  channels: ProcessingChannel[];
}

export class OwnerResponseDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  ownershipPercent: number;
  isPrimaryContact: boolean;
  /** The full national ID is never returned. @example "•••••6789" */
  nationalIdMasked: string;
}

/** SALES users don't get riskScore, reasons or lastError (need-to-know). */
export class RiskAssessmentResponseDto {
  submissionNumber: number;
  status: RiskAssessmentStatus;
  riskLevel: RiskLevel | null;
  riskScore?: number | null;
  reasons?: string[];
  attempts: number;
  lastError?: string | null;
  completedAt: Date | null;
}

export class DecisionResponseDto {
  id: string;
  decision: DecisionType;
  note: string | null;
  submissionNumber: number;
  riskLevelAtDecision: RiskLevel;
  reviewer: UserRefDto;
  createdAt: Date;
}

/** Full detail of one application. */
export class ApplicationDto {
  id: string;
  businessName: string;
  legalBusinessName: string;
  businessType: BusinessType;
  industry: Industry;
  registrationNumber: string;
  processing: ProcessingResponseDto;
  owners: OwnerResponseDto[];
  status: ApplicationStatus;
  riskStatus: RiskStatus;
  riskLevel: RiskLevel | null;
  submissionCount: number;
  createdBy: UserRefDto;
  assignedReviewer: UserRefDto | null;
  riskAssessments: RiskAssessmentResponseDto[];
  decisions: DecisionResponseDto[];
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A list item: no owners or risk details (use the detail endpoint for those). */
export class ApplicationSummaryDto {
  id: string;
  businessName: string;
  status: ApplicationStatus;
  riskStatus: RiskStatus;
  riskLevel: RiskLevel | null;
  createdBy: UserRefDto;
  assignedReviewer: UserRefDto | null;
  submissionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ApplicationListResponseDto {
  data: ApplicationSummaryDto[];
  meta: PageMetaDto;
}
