/** Where the application is in the business workflow. See docs/design/lifecycle.html. */
export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  INFO_REQUESTED = 'INFO_REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** What the background risk check is doing. Kept separate from the workflow status. */
export enum RiskStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/** Legal structure of the business. */
export enum BusinessType {
  SOLE_PROPRIETORSHIP = 'SOLE_PROPRIETORSHIP',
  PARTNERSHIP = 'PARTNERSHIP',
  PRIVATE_LIMITED = 'PRIVATE_LIMITED',
  PUBLIC_LIMITED = 'PUBLIC_LIMITED',
  NON_PROFIT = 'NON_PROFIT',
}

export enum Industry {
  RETAIL = 'RETAIL',
  FOOD_AND_BEVERAGE = 'FOOD_AND_BEVERAGE',
  ECOMMERCE = 'ECOMMERCE',
  TRAVEL = 'TRAVEL',
  DIGITAL_GOODS = 'DIGITAL_GOODS',
  OTHER = 'OTHER',
}

/** How the merchant will take payments. */
export enum ProcessingChannel {
  /** Card physically at a terminal. */
  CARD_PRESENT = 'CARD_PRESENT',
  /** Online checkout (card not present). */
  ECOMMERCE = 'ECOMMERCE',
  /** Subscriptions charged automatically (card not present). */
  RECURRING = 'RECURRING',
}

export enum DecisionType {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}
