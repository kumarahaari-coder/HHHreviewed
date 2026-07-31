export type UserRole = "SUPER_ADMIN" | "FINANCE_ADMIN" | "PARTNER_OWNER" | "ADMIN" | "CREATOR";
export type PartnerStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED" | "INACTIVE";
export type SiteStatus = "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
export type ReservationStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "COMPLETED" | "UNKNOWN";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "DISPUTED" | "UNKNOWN";
export type AttributionStatus = "ATTRIBUTED" | "UNATTRIBUTED" | "SYSTEM_ERROR" | "RECONCILED";
export type PayoutStatus = "ESTIMATED" | "ELIGIBLE" | "APPROVED" | "ON_HOLD" | "REJECTED" | "PAID";
export type PayoutBatchStatus = "PENDING" | "PAID" | "CANCELLED";

export type TaxDocumentType = "W_9" | "W_8";
export type W8Subtype = "W_8BEN" | "W_8BEN_E" | "OTHER";
export type TaxDocumentStatus = "NOT_SUBMITTED" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "REPLACEMENT_REQUIRED";
export type QuarantineStatus = "QUARANTINED" | "PASSED" | "FAILED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  partnerId?: string; // Optional, set if role is PARTNER_OWNER or CREATOR
  status: "ACTIVE" | "SUSPENDED";
  lastLogin?: string;
  createdAt: string;
  clerkUserId?: string;
  clerkInvitationId?: string;
  onboardingStatus?: "PENDING" | "IN_PROGRESS" | "COMPLETED";
}

export interface Partner {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  paymentMethod: "BANK_TRANSFER" | "PAYPAL" | "STRIPE" | "WISE";
  currency: string; // e.g. "USD"
  payoutFrequency: "MONTHLY" | "BI_WEEKLY" | "WEEKLY";
  status: PartnerStatus;
  createdAt: string;
  notes?: string;
  website?: string;
  commissionRate?: number;
  taxDocumentCategory?: TaxDocumentType;
  lastLogin?: string;
  stripeCustomerId?: string;
  stripeConnectAccountId?: string;
  stripeOnboardingStatus?: "NOT_CONNECTED" | "PENDING" | "CONNECTED";
}

export interface TaxDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  documentType: TaxDocumentType;
  w8Subtype?: W8Subtype;
  s3StorageKey: string;
  originalFilename: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  isSuperseded: boolean;
  confirmationChecked: boolean;
  quarantineStatus: QuarantineStatus;
  submissionDate: string;
}

export interface CreatorTaxDocument {
  id: string;
  partnerId: string;
  currentVersionId?: string;
  status: TaxDocumentStatus;
  adminNote?: string;
  internalNote?: string;
  createdAt: string;
  updatedAt: string;
  versions?: TaxDocumentVersion[];
}

export interface TaxDocumentAuditLog {
  id: string;
  documentId?: string;
  versionId?: string;
  partnerId: string;
  action: "UPLOAD" | "REPLACE" | "REVIEW_UPDATE" | "DOWNLOAD" | "DELETE";
  performedByUserId: string;
  performedByUserRole: string;
  ipAddress?: string;
  details?: string;
  timestamp: string;
}

export interface IntegrationIdempotencyLog {
  id: string;
  provider: "CLERK" | "STRIPE" | "BREVO";
  eventId: string;
  eventType: string;
  processedAt: string;
  status: "PROCESSED" | "FAILED" | "SKIPPED";
}

export interface Site {
  id: string;
  partnerId: string;
  siteName: string;
  websiteUrl: string;
  hospitableWidgetId: string;
  bookingUrl: string;
  trackingCode: string;
  commissionRuleId: string;
  status: SiteStatus;
  launchDate: string;
}

export interface Property {
  id: string;
  hospitablePropertyId: string;
  name: string;
  location: string; // e.g., "St. Augustine, FL"
  timezone: string;
  imageUrl?: string;
  status: "ACTIVE" | "INACTIVE";
  websiteUrl?: string;
  bookingUrl?: string;
  summary?: string;
  mood?: string;
  minimumAge?: number;
  maximumOccupancy?: number;
  sourceUrl?: string;
  sourceVerifiedAt?: string;
  syncStatus?: string;
}

export interface Reservation {
  id: string;
  hospitableReservationId: string;
  confirmationCode: string;
  partnerId?: string; // Nullable if unattributed
  siteId?: string; // Nullable if unattributed
  propertyId: string;
  bookingDate: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  guests: number;
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentStatus;
  bookingAmount: number; // Gross amount
  amountReceived: number; // Net received by HHH
  refundAmount: number;
  taxesAmount: number;
  cleaningFee: number;
  serviceFee: number;
  currency: string;
  attributionStatus: AttributionStatus;
  payoutStatus: PayoutStatus;
  originalData?: string; // Original Hospitable JSON
  lastSyncedAt: string;
  adminNotes?: string;
  attributionSource?: string; // e.g., "Widget ID", "Referrer URL", "Campaign Parameter"
  platform?: string;
  financialDataAvailable?: boolean;
  paymentConfirmationSource?: string;
}

export interface CommissionRule {
  id: string;
  name: string;
  ruleType: "FIXED_PER_BOOKING" | "PERCENTAGE_GROSS" | "PERCENTAGE_EX_TAX" | "PERCENTAGE_NET" | "TIERED";
  percentage?: number; // e.g., 10 for 10%
  fixedAmount?: number; // e.g., 50 for $50
  payoutBase: "GROSS" | "EX_TAX" | "NET_HHH" | "NET_AFTER_REFUNDS" | "FIXED";
  effectiveStartDate: string;
  effectiveEndDate?: string;
  status: "ACTIVE" | "ARCHIVED";
}

export interface Payout {
  id: string;
  reservationId: string;
  partnerId: string;
  siteId: string;
  payoutBaseAmount: number;
  commissionRate: number; // percentage or fixed amount representation
  calculatedPayout: number;
  adjustment: number;
  finalPayout: number;
  status: PayoutStatus;
  approvalDate?: string;
  paymentDate?: string;
  transactionReference?: string;
  notes?: string;
}

export interface PayoutBatch {
  id: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  bookingCount: number;
  totalPayout: number;
  status: PayoutBatchStatus;
  approvalDate?: string;
  paymentDate?: string;
  transactionReference?: string;
  payoutIds: string[];
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string; // e.g. "APPROVE_PAYOUT", "UPDATE_PARTNER", "CREATE_SITE"
  recordType: "PARTNER" | "SITE" | "RESERVATION" | "PAYOUT" | "PAYOUT_BATCH" | "COMMISSION_RULE";
  recordId: string;
  previousValue?: string;
  updatedValue?: string;
  createdAt: string;
  ipAddress?: string;
}

export interface SystemNotification {
  id: string;
  userId?: string; // Admin or Partner User ID (undefined means all admins)
  type: "INFO" | "WARNING" | "SUCCESS" | "ALERT";
  message: string;
  read: boolean;
  createdAt: string;
}

