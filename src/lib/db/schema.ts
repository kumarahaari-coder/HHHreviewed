export type UserRole = "SUPER_ADMIN" | "FINANCE_ADMIN" | "PARTNER_OWNER";
export type PartnerStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type SiteStatus = "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
export type ReservationStatus =
  | "UNKNOWN"
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "COMPLETED";
export type PaymentStatus =
  | "UNKNOWN"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";
export type AttributionStatus = "ATTRIBUTED" | "UNATTRIBUTED" | "SYSTEM_ERROR" | "RECONCILED";
export type PayoutStatus = "ESTIMATED" | "ELIGIBLE" | "APPROVED" | "ON_HOLD" | "REJECTED" | "PAID";
export type PayoutBatchStatus = "PENDING" | "PAID" | "CANCELLED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  partnerId?: string;
  status: "ACTIVE" | "SUSPENDED";
  lastLogin?: string;
  createdAt: string;
}

export interface Partner {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  paymentMethod: "BANK_TRANSFER" | "PAYPAL" | "STRIPE" | "WISE";
  currency: string;
  payoutFrequency: "MONTHLY" | "BI_WEEKLY" | "WEEKLY";
  status: PartnerStatus;
  createdAt: string;
  notes?: string;
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
  location: string;
  timezone: string;
  imageUrl?: string;
  websiteUrl?: string;
  bookingUrl?: string;
  summary?: string;
  mood?: string;
  minimumAge?: number;
  maximumOccupancy?: number;
  sourceUrl?: string;
  sourceVerifiedAt?: string;
  syncStatus?: "PUBLIC_SITE_ONLY" | "HOSPITABLE_SYNCED";
  status: "ACTIVE" | "INACTIVE";
}

export interface Reservation {
  id: string;
  hospitableReservationId: string;
  confirmationCode: string;
  partnerId?: string;
  siteId?: string;
  propertyId: string;
  bookingDate: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  guests: number;
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentStatus;
  bookingAmount: number;
  amountReceived: number;
  refundAmount: number;
  taxesAmount: number;
  cleaningFee: number;
  serviceFee: number;
  currency: string;
  attributionStatus: AttributionStatus;
  payoutStatus: PayoutStatus;
  originalData?: string;
  lastSyncedAt: string;
  adminNotes?: string;
  attributionSource?: string;
  platform?: string;
  paymentConfirmationSource?: "HOSPITABLE" | "MANUAL_ADMIN" | "NOT_AVAILABLE";
  financialDataAvailable?: boolean;
}

export interface CommissionRule {
  id: string;
  name: string;
  ruleType: "FIXED_PER_BOOKING" | "PERCENTAGE_GROSS" | "PERCENTAGE_EX_TAX" | "PERCENTAGE_NET" | "TIERED";
  percentage?: number;
  fixedAmount?: number;
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
  commissionRate: number;
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
  action: string;
  recordType: "PARTNER" | "SITE" | "RESERVATION" | "PAYOUT" | "PAYOUT_BATCH" | "COMMISSION_RULE";
  recordId: string;
  previousValue?: string;
  updatedValue?: string;
  createdAt: string;
  ipAddress?: string;
}

export interface SystemNotification {
  id: string;
  userId?: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "ALERT";
  message: string;
  read: boolean;
  createdAt: string;
}
