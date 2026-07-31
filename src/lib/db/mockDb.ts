import {
  User,
  Partner,
  Site,
  Property,
  Reservation,
  CommissionRule,
  Payout,
  PayoutBatch,
  AuditLog,
  SystemNotification,
  UserRole,
  PartnerStatus,
  SiteStatus,
  ReservationStatus,
  PaymentStatus,
  AttributionStatus,
  PayoutStatus,
  PayoutBatchStatus
} from "./schema";

// Seed Properties
const INITIAL_PROPERTIES: Property[] = [
  {
    id: "prop-001",
    hospitablePropertyId: "hosp-prop-uptown",
    name: "Uptown Retreat",
    location: "St. Augustine, FL",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-updown-img1-scaled.webp",
    status: "ACTIVE"
  },
  {
    id: "prop-002",
    hospitablePropertyId: "hosp-prop-downtown",
    name: "Downtown Retreat",
    location: "St. Augustine, FL",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-down-img1-scaled.webp",
    status: "ACTIVE"
  },
  {
    id: "prop-003",
    hospitablePropertyId: "hosp-prop-ellsworth",
    name: "Ellsworth Retreat",
    location: "Ellsworth, ME",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/03/image1.jpg",
    status: "ACTIVE"
  },
  {
    id: "prop-004",
    hospitablePropertyId: "hosp-prop-beech",
    name: "Beech Mountain Retreat",
    location: "Beech Mountain, NC",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-beeach-img1-scaled.webp",
    status: "ACTIVE"
  }
];

// Seed Commission Rules
const INITIAL_RULES: CommissionRule[] = [
  {
    id: "rule-001",
    name: "10% Gross Booking Value",
    ruleType: "PERCENTAGE_GROSS",
    percentage: 10,
    payoutBase: "GROSS",
    effectiveStartDate: "2026-01-01",
    status: "ACTIVE"
  },
  {
    id: "rule-002",
    name: "15% Net HHH Revenue (Ex Tax/Clean)",
    ruleType: "PERCENTAGE_NET",
    percentage: 15,
    payoutBase: "NET_HHH",
    effectiveStartDate: "2026-01-01",
    status: "ACTIVE"
  },
  {
    id: "rule-003",
    name: "Fixed $100 Per Booking",
    ruleType: "FIXED_PER_BOOKING",
    fixedAmount: 100,
    payoutBase: "FIXED",
    effectiveStartDate: "2026-01-01",
    status: "ACTIVE"
  }
];

// Seed Partners
const INITIAL_PARTNERS: Partner[] = [
  {
    id: "partner-001",
    businessName: "Megs Brass Connection",
    contactName: "Megan Brass",
    email: "megan@megsbrass.com",
    phone: "555-0192",
    paymentMethod: "BANK_TRANSFER",
    currency: "USD",
    payoutFrequency: "MONTHLY",
    status: "ACTIVE",
    createdAt: "2026-02-15",
    notes: "Primary launch partner. Promotes Uptown and Downtown retreats."
  },
  {
    id: "partner-002",
    businessName: "Lucy Escapes LLC",
    contactName: "Lucy Hampton",
    email: "lucy@escapes.com",
    phone: "555-8822",
    paymentMethod: "WISE",
    currency: "USD",
    payoutFrequency: "BI_WEEKLY",
    status: "ACTIVE",
    createdAt: "2026-03-01",
    notes: "Promotes Maine & Beech Mountain cabins. High conversion referrer."
  },
  {
    id: "partner-003",
    businessName: "Coastal Travel Guide",
    contactName: "John Miller",
    email: "john@coasttravel.com",
    phone: "555-3344",
    paymentMethod: "PAYPAL",
    currency: "USD",
    payoutFrequency: "MONTHLY",
    status: "SUSPENDED",
    createdAt: "2026-04-10",
    notes: "Account temporarily suspended due to administrative review."
  }
];

// Seed Partner Sites
const INITIAL_SITES: Site[] = [
  {
    id: "site-001",
    partnerId: "partner-001",
    siteName: "Megs Brass Stays",
    websiteUrl: "https://megsbrass.com/pages/stays",
    hospitableWidgetId: "widget_megs_stays_01",
    bookingUrl: "https://book.hiddenhoneyhomes.com/r/site-001",
    trackingCode: "MB-UPTOWN-1",
    commissionRuleId: "rule-001", // 10% Gross
    status: "ACTIVE",
    launchDate: "2026-02-20"
  },
  {
    id: "site-002",
    partnerId: "partner-001",
    siteName: "Megan's Direct Guide",
    websiteUrl: "https://megsbrass.com/blogs/connection",
    hospitableWidgetId: "widget_megs_guide_02",
    bookingUrl: "https://book.hiddenhoneyhomes.com/r/site-002",
    trackingCode: "MB-DOWNTOWN-2",
    commissionRuleId: "rule-002", // 15% Net
    status: "ACTIVE",
    launchDate: "2026-03-01"
  },
  {
    id: "site-003",
    partnerId: "partner-002",
    siteName: "Lucy Escapes Blog",
    websiteUrl: "https://lucyescapes.com",
    hospitableWidgetId: "widget_lucy_escapes",
    bookingUrl: "https://book.hiddenhoneyhomes.com/r/site-003",
    trackingCode: "LE-MAINE-3",
    commissionRuleId: "rule-001", // 10% Gross
    status: "ACTIVE",
    launchDate: "2026-03-05"
  },
  {
    id: "site-004",
    partnerId: "partner-002",
    siteName: "Beech Mountain Stays Portal",
    websiteUrl: "https://beechmountainstays.org",
    hospitableWidgetId: "widget_beech_stays",
    bookingUrl: "https://book.hiddenhoneyhomes.com/r/site-004",
    trackingCode: "LE-BEECH-4",
    commissionRuleId: "rule-003", // Fixed $100
    status: "ACTIVE",
    launchDate: "2026-03-12"
  },
  {
    id: "site-005",
    partnerId: "partner-003",
    siteName: "Coastal St. Augustine Index",
    websiteUrl: "https://coastaltravelindex.com/st-augustine",
    hospitableWidgetId: "widget_coastal_staug",
    bookingUrl: "https://book.hiddenhoneyhomes.com/r/site-005",
    trackingCode: "CTG-COAST-5",
    commissionRuleId: "rule-001",
    status: "PAUSED",
    launchDate: "2026-04-12"
  }
];

// Seed Users
const INITIAL_USERS: User[] = [
  {
    id: "user-admin-1",
    name: "HHH Super Admin",
    email: "admin@hiddenhoneyhomes.com",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    lastLogin: "2026-07-28T12:00:00Z",
    createdAt: "2026-01-10"
  },
  {
    id: "user-finance-1",
    name: "Sarah Jenkins (Finance)",
    email: "finance@hiddenhoneyhomes.com",
    role: "FINANCE_ADMIN",
    status: "ACTIVE",
    lastLogin: "2026-07-28T10:30:00Z",
    createdAt: "2026-02-01"
  },
  {
    id: "user-partner-megan",
    name: "Megan Brass",
    email: "megan@megsbrass.com",
    role: "PARTNER_OWNER",
    partnerId: "partner-001",
    status: "ACTIVE",
    lastLogin: "2026-07-28T11:45:00Z",
    createdAt: "2026-02-15"
  },
  {
    id: "user-partner-lucy",
    name: "Lucy Hampton",
    email: "lucy@escapes.com",
    role: "PARTNER_OWNER",
    partnerId: "partner-002",
    status: "ACTIVE",
    lastLogin: "2026-07-27T16:20:00Z",
    createdAt: "2026-03-01"
  }
];

// Seed Reservations
const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: "res-001",
    hospitableReservationId: "hosp-res-1001",
    confirmationCode: "HHH-8U39K2",
    partnerId: "partner-001",
    siteId: "site-001",
    propertyId: "prop-001", // Uptown St. Augustine
    bookingDate: "2026-06-15T14:20:00Z",
    checkInDate: "2026-07-02",
    checkOutDate: "2026-07-05",
    nights: 3,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "PAID",
    bookingAmount: 1200.00,
    amountReceived: 1080.00, // Net amount received by HHH
    refundAmount: 0,
    taxesAmount: 120.00,
    cleaningFee: 150.00,
    serviceFee: 80.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "APPROVED",
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Widget ID",
    adminNotes: "Attributed successfully via widget_megs_stays_01."
  },
  {
    id: "res-002",
    hospitableReservationId: "hosp-res-1002",
    confirmationCode: "HHH-4Y92H4",
    partnerId: "partner-001",
    siteId: "site-002",
    propertyId: "prop-002", // Downtown St. Augustine
    bookingDate: "2026-06-18T10:05:00Z",
    checkInDate: "2026-07-10",
    checkOutDate: "2026-07-15",
    nights: 5,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "PAID",
    bookingAmount: 2200.00,
    amountReceived: 1980.00,
    refundAmount: 0,
    taxesAmount: 220.00,
    cleaningFee: 180.00,
    serviceFee: 150.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "ELIGIBLE",
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Referrer URL",
    adminNotes: "Checked in and payment confirmed. Pending approval in queue."
  },
  {
    id: "res-003",
    hospitableReservationId: "hosp-res-1003",
    confirmationCode: "HHH-9E22P8",
    partnerId: "partner-002",
    siteId: "site-003",
    propertyId: "prop-003", // Ellsworth Maine
    bookingDate: "2026-06-25T17:50:00Z",
    checkInDate: "2026-07-12",
    checkOutDate: "2026-07-15",
    nights: 3,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "PAID",
    bookingAmount: 1500.00,
    amountReceived: 1350.00,
    refundAmount: 0,
    taxesAmount: 150.00,
    cleaningFee: 160.00,
    serviceFee: 100.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "APPROVED",
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Campaign Parameter",
    adminNotes: "Attributed via campaign promo code."
  },
  {
    id: "res-004",
    hospitableReservationId: "hosp-res-1004",
    confirmationCode: "HHH-2M88S9",
    partnerId: "partner-002",
    siteId: "site-004",
    propertyId: "prop-004", // Beech Mountain
    bookingDate: "2026-07-05T09:12:00Z",
    checkInDate: "2026-07-18",
    checkOutDate: "2026-07-21",
    nights: 3,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "PAID",
    bookingAmount: 1350.00,
    amountReceived: 1215.00,
    refundAmount: 0,
    taxesAmount: 135.00,
    cleaningFee: 150.00,
    serviceFee: 90.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "ELIGIBLE",
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Widget ID",
    adminNotes: "Fixed rate booking. Checked out."
  },
  {
    id: "res-005",
    hospitableReservationId: "hosp-res-1005",
    confirmationCode: "HHH-7W39X1",
    partnerId: "partner-001",
    siteId: "site-001",
    propertyId: "prop-001", // Uptown St. Augustine
    bookingDate: "2026-07-12T11:40:00Z",
    checkInDate: "2026-08-05", // FUTURE BOOKING
    checkOutDate: "2026-08-08",
    nights: 3,
    guests: 2,
    reservationStatus: "CONFIRMED",
    paymentStatus: "PAID",
    bookingAmount: 1250.00,
    amountReceived: 1125.00,
    refundAmount: 0,
    taxesAmount: 125.00,
    cleaningFee: 150.00,
    serviceFee: 85.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "ESTIMATED", // Estimated since check-in is in future
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Widget ID",
    adminNotes: "Future stay. Estimated payout calculated."
  },
  {
    id: "res-006",
    hospitableReservationId: "hosp-res-1006",
    confirmationCode: "HHH-3B90L2",
    partnerId: "partner-001",
    siteId: "site-002",
    propertyId: "prop-002", // Downtown St. Augustine
    bookingDate: "2026-07-14T15:22:00Z",
    checkInDate: "2026-07-22",
    checkOutDate: "2026-07-25",
    nights: 3,
    guests: 2,
    reservationStatus: "CHECKED_IN",
    paymentStatus: "PAID",
    bookingAmount: 1400.00,
    amountReceived: 1260.00,
    refundAmount: 0,
    taxesAmount: 140.00,
    cleaningFee: 160.00,
    serviceFee: 95.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "ELIGIBLE", // Guest is checked in!
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Referrer URL",
    adminNotes: "Guest currently checked in. Booking is now payout-eligible."
  },
  {
    id: "res-007",
    hospitableReservationId: "hosp-res-1007",
    confirmationCode: "HHH-5N49C8",
    partnerId: undefined, // UNATTRIBUTED!
    siteId: undefined,
    propertyId: "prop-003", // Ellsworth Maine
    bookingDate: "2026-07-15T08:35:00Z",
    checkInDate: "2026-07-20",
    checkOutDate: "2026-07-24",
    nights: 4,
    guests: 2,
    reservationStatus: "CHECKED_OUT",
    paymentStatus: "PAID",
    bookingAmount: 2000.00,
    amountReceived: 1800.00,
    refundAmount: 0,
    taxesAmount: 200.00,
    cleaningFee: 180.00,
    serviceFee: 140.00,
    currency: "USD",
    attributionStatus: "UNATTRIBUTED", // Needs manual matching
    payoutStatus: "ESTIMATED",
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: undefined,
    adminNotes: "No matching widget ID or campaign code detected. In review queue."
  },
  {
    id: "res-008",
    hospitableReservationId: "hosp-res-1008",
    confirmationCode: "HHH-8D90W1",
    partnerId: "partner-002",
    siteId: "site-003",
    propertyId: "prop-003", // Ellsworth Maine
    bookingDate: "2026-07-02T13:40:00Z",
    checkInDate: "2026-07-08",
    checkOutDate: "2026-07-11",
    nights: 3,
    guests: 2,
    reservationStatus: "CANCELLED", // CANCELLED BOOKING
    paymentStatus: "REFUNDED",
    bookingAmount: 1500.00,
    amountReceived: 0,
    refundAmount: 1500.00,
    taxesAmount: 150.00,
    cleaningFee: 160.00,
    serviceFee: 100.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "REJECTED", // Ineligible because cancelled
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Campaign Parameter",
    adminNotes: "Cancelled by guest. Fully refunded. Payout rejected."
  },
  {
    id: "res-009",
    hospitableReservationId: "hosp-res-1009",
    confirmationCode: "HHH-9K23J7",
    partnerId: "partner-001",
    siteId: "site-001",
    propertyId: "prop-001", // Uptown St. Augustine
    bookingDate: "2026-06-02T11:00:00Z",
    checkInDate: "2026-06-15",
    checkOutDate: "2026-06-18",
    nights: 3,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "PAID",
    bookingAmount: 1200.00,
    amountReceived: 1080.00,
    refundAmount: 0,
    taxesAmount: 120.00,
    cleaningFee: 150.00,
    serviceFee: 80.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "PAID", // Already Paid!
    lastSyncedAt: "2026-06-20T09:00:00Z",
    attributionSource: "Widget ID",
    adminNotes: "Paid in Batch HHH-BATCH-2026-06."
  },
  {
    id: "res-010",
    hospitableReservationId: "hosp-res-1010",
    confirmationCode: "HHH-1A83N9",
    partnerId: "partner-001",
    siteId: "site-002",
    propertyId: "prop-002", // Downtown St. Augustine
    bookingDate: "2026-07-01T15:00:00Z",
    checkInDate: "2026-07-05",
    checkOutDate: "2026-07-10",
    nights: 5,
    guests: 2,
    reservationStatus: "COMPLETED",
    paymentStatus: "DISPUTED", // Payment disputed!
    bookingAmount: 2200.00,
    amountReceived: 2200.00,
    refundAmount: 0,
    taxesAmount: 220.00,
    cleaningFee: 180.00,
    serviceFee: 150.00,
    currency: "USD",
    attributionStatus: "ATTRIBUTED",
    payoutStatus: "ON_HOLD", // Placed on hold due to dispute
    lastSyncedAt: "2026-07-28T09:00:00Z",
    attributionSource: "Referrer URL",
    adminNotes: "Payment status is DISPUTED. Automatic hold placed."
  }
];

// Seed Payouts (corresponds to res-001, res-003, res-009)
const INITIAL_PAYOUTS: Payout[] = [
  {
    id: "payout-001",
    reservationId: "res-001",
    partnerId: "partner-001",
    siteId: "site-001",
    payoutBaseAmount: 1200.00, // Gross
    commissionRate: 10, // 10%
    calculatedPayout: 120.00,
    adjustment: 0,
    finalPayout: 120.00,
    status: "APPROVED",
    approvalDate: "2026-07-15T16:00:00Z"
  },
  {
    id: "payout-003",
    reservationId: "res-003",
    partnerId: "partner-002",
    siteId: "site-003",
    payoutBaseAmount: 1500.00, // Gross
    commissionRate: 10, // 10%
    calculatedPayout: 150.00,
    adjustment: 15.00, // custom adjust
    finalPayout: 165.00,
    status: "APPROVED",
    approvalDate: "2026-07-20T11:00:00Z",
    notes: "Adding 10% bonus adjustment for Summer promotion."
  },
  {
    id: "payout-009",
    reservationId: "res-009",
    partnerId: "partner-001",
    siteId: "site-001",
    payoutBaseAmount: 1200.00, // Gross
    commissionRate: 10,
    calculatedPayout: 120.00,
    adjustment: 0,
    finalPayout: 120.00,
    status: "PAID",
    approvalDate: "2026-06-20T10:00:00Z",
    paymentDate: "2026-06-25T14:00:00Z",
    transactionReference: "TXN-9023485"
  }
];

// Seed Payout Batches
const INITIAL_BATCHES: PayoutBatch[] = [
  {
    id: "batch-001",
    partnerId: "partner-001",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    bookingCount: 1,
    totalPayout: 120.00,
    status: "PAID",
    approvalDate: "2026-06-20T10:00:00Z",
    paymentDate: "2026-06-25T14:00:00Z",
    transactionReference: "TXN-9023485",
    payoutIds: ["payout-009"]
  }
];

// Seed Audit Logs
const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: "log-001",
    userId: "user-admin-1",
    userName: "HHH Super Admin",
    action: "INITIAL_SEED",
    recordType: "COMMISSION_RULE",
    recordId: "rule-001",
    createdAt: "2026-07-28T09:00:00Z",
    ipAddress: "192.168.1.1"
  },
  {
    id: "log-002",
    userId: "user-admin-1",
    userName: "HHH Super Admin",
    action: "APPROVE_PAYOUT",
    recordType: "PAYOUT",
    recordId: "payout-001",
    previousValue: "Calculated: $120.00, Status: ESTIMATED",
    updatedValue: "Final: $120.00, Status: APPROVED",
    createdAt: "2026-07-28T10:00:00Z",
    ipAddress: "192.168.1.1"
  }
];

// Seed Notifications
const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: "notif-001",
    type: "WARNING",
    message: "New unattributed booking detected: HHH-5N49C8 requires manual reconciliation.",
    read: false,
    createdAt: "2026-07-28T08:40:00Z"
  },
  {
    id: "notif-002",
    type: "SUCCESS",
    message: "Partner Megs Brass Connection added 2 new bookings this week.",
    read: true,
    createdAt: "2026-07-27T14:00:00Z"
  }
];

// Helper to check if running in browser
const isBrowser = () => typeof window !== "undefined";

// State Management Wrapper
class MockDatabase {
  private getStorage = <T>(key: string, defaultValue: T): T => {
    if (!isBrowser()) return defaultValue;
    const data = localStorage.getItem(key);
    if (!data) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
    try {
      return JSON.parse(data);
    } catch {
      return defaultValue;
    }
  };

  private setStorage = <T>(key: string, value: T): void => {
    if (!isBrowser()) return;
    localStorage.setItem(key, JSON.stringify(value));
  };

  // Getters
  get users(): User[] { return this.getStorage("hhh_users", INITIAL_USERS); }
  set users(val: User[]) { this.setStorage("hhh_users", val); }

  get partners(): Partner[] { return this.getStorage("hhh_partners", INITIAL_PARTNERS); }
  set partners(val: Partner[]) { this.setStorage("hhh_partners", val); }

  get sites(): Site[] { return this.getStorage("hhh_sites", INITIAL_SITES); }
  set sites(val: Site[]) { this.setStorage("hhh_sites", val); }

  get properties(): Property[] { return this.getStorage("hhh_properties", INITIAL_PROPERTIES); }
  set properties(val: Property[]) { this.setStorage("hhh_properties", val); }

  get reservations(): Reservation[] { return this.getStorage("hhh_reservations", INITIAL_RESERVATIONS); }
  set reservations(val: Reservation[]) { this.setStorage("hhh_reservations", val); }

  get commissionRules(): CommissionRule[] { return this.getStorage("hhh_rules", INITIAL_RULES); }
  set commissionRules(val: CommissionRule[]) { this.setStorage("hhh_rules", val); }

  get payouts(): Payout[] { return this.getStorage("hhh_payouts", INITIAL_PAYOUTS); }
  set payouts(val: Payout[]) { this.setStorage("hhh_payouts", val); }

  get batches(): PayoutBatch[] { return this.getStorage("hhh_batches", INITIAL_BATCHES); }
  set batches(val: PayoutBatch[]) { this.setStorage("hhh_batches", val); }

  get auditLogs(): AuditLog[] { return this.getStorage("hhh_audit_logs", INITIAL_AUDIT_LOGS); }
  set auditLogs(val: AuditLog[]) { this.setStorage("hhh_audit_logs", val); }

  get notifications(): SystemNotification[] { return this.getStorage("hhh_notifications", INITIAL_NOTIFICATIONS); }
  set notifications(val: SystemNotification[]) { this.setStorage("hhh_notifications", val); }

  get taxDocuments(): any[] { return this.getStorage("hhh_tax_documents", []); }
  set taxDocuments(val: any[]) { this.setStorage("hhh_tax_documents", val); }

  get taxVersions(): any[] { return this.getStorage("hhh_tax_versions", []); }
  set taxVersions(val: any[]) { this.setStorage("hhh_tax_versions", val); }

  get taxAuditLogs(): any[] { return this.getStorage("hhh_tax_audit_logs", []); }
  set taxAuditLogs(val: any[]) { this.setStorage("hhh_tax_audit_logs", val); }

  get idempotencyLogs(): any[] { return this.getStorage("hhh_idempotency_logs", []); }
  set idempotencyLogs(val: any[]) { this.setStorage("hhh_idempotency_logs", val); }

  // Tax Document Helpers
  getTaxDocumentByPartner(partnerId: string) {
    const docs = this.taxDocuments;
    const doc = docs.find(d => d.partnerId === partnerId);
    if (!doc) return null;
    const versions = this.taxVersions.filter(v => v.documentId === doc.id).sort((a, b) => b.versionNumber - a.versionNumber);
    const currentVersion = versions.find(v => v.id === doc.currentVersionId) || versions[0];
    return {
      ...doc,
      currentVersion,
      versions
    };
  }

  saveTaxSubmission(data: {
    partnerId: string;
    documentType: "W_9" | "W_8";
    w8Subtype?: "W_8BEN" | "W_8BEN_E" | "OTHER";
    s3StorageKey: string;
    originalFilename: string;
    fileHash: string;
    fileSize: number;
    mimeType: string;
    confirmationChecked: boolean;
    quarantineStatus?: "QUARANTINED" | "PASSED" | "FAILED";
  }) {
    const now = new Date().toISOString();
    const existingDocs = this.taxDocuments;
    let doc = existingDocs.find(d => d.partnerId === data.partnerId);

    if (!doc) {
      doc = {
        id: `taxdoc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        partnerId: data.partnerId,
        status: "SUBMITTED",
        createdAt: now,
        updatedAt: now
      };
      existingDocs.push(doc);
    } else {
      doc.status = "SUBMITTED";
      doc.updatedAt = now;
    }

    // Supersede previous versions
    const allVersions = this.taxVersions.map(v => v.documentId === doc.id ? { ...v, isSuperseded: true } : v);
    const versionCount = allVersions.filter(v => v.documentId === doc.id).length;

    const newVersion = {
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      documentId: doc.id,
      versionNumber: versionCount + 1,
      documentType: data.documentType,
      w8Subtype: data.w8Subtype,
      s3StorageKey: data.s3StorageKey,
      originalFilename: data.originalFilename,
      fileHash: data.fileHash,
      fileSize: data.fileSize,
      mimeType: data.mimeType || "application/pdf",
      isSuperseded: false,
      confirmationChecked: data.confirmationChecked,
      quarantineStatus: data.quarantineStatus || "PASSED",
      submissionDate: now
    };

    allVersions.push(newVersion);
    doc.currentVersionId = newVersion.id;

    this.taxDocuments = existingDocs;
    this.taxVersions = allVersions;

    this.logTaxAudit({
      documentId: doc.id,
      versionId: newVersion.id,
      partnerId: data.partnerId,
      action: versionCount > 0 ? "REPLACE" : "UPLOAD",
      performedByUserId: this.currentUser?.id || "system",
      performedByUserRole: this.currentUser?.role || "CREATOR",
      details: `Tax form ${data.documentType} (v${newVersion.versionNumber}) submitted.`
    });

    return { doc, version: newVersion };
  }

  updateTaxReviewStatus(documentId: string, status: "APPROVED" | "REJECTED" | "REPLACEMENT_REQUIRED", adminNote?: string, internalNote?: string) {
    const docs = this.taxDocuments;
    const idx = docs.findIndex(d => d.id === documentId);
    if (idx === -1) throw new Error("Tax document not found");

    const updated = {
      ...docs[idx],
      status,
      adminNote: adminNote ?? docs[idx].adminNote,
      internalNote: internalNote ?? docs[idx].internalNote,
      updatedAt: new Date().toISOString()
    };

    docs[idx] = updated;
    this.taxDocuments = docs;

    this.logTaxAudit({
      documentId,
      versionId: updated.currentVersionId,
      partnerId: updated.partnerId,
      action: "REVIEW_UPDATE",
      performedByUserId: this.currentUser?.id || "system",
      performedByUserRole: this.currentUser?.role || "ADMIN",
      details: `Status set to ${status}. Note: ${adminNote || "None"}`
    });

    return updated;
  }

  logTaxAudit(params: {
    documentId?: string;
    versionId?: string;
    partnerId: string;
    action: "UPLOAD" | "REPLACE" | "REVIEW_UPDATE" | "DOWNLOAD" | "DELETE";
    performedByUserId: string;
    performedByUserRole: string;
    details?: string;
  }) {
    const logs = this.taxAuditLogs;
    const entry = {
      id: `taxaudit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...params,
      timestamp: new Date().toISOString(),
      ipAddress: "127.0.0.1"
    };
    this.taxAuditLogs = [entry, ...logs];
    return entry;
  }

  // Idempotency check
  isIdempotentEvent(provider: "CLERK" | "STRIPE" | "BREVO", eventId: string): boolean {
    return this.idempotencyLogs.some(l => l.provider === provider && l.eventId === eventId);
  }

  recordIdempotency(provider: "CLERK" | "STRIPE" | "BREVO", eventId: string, eventType: string, status: "PROCESSED" | "FAILED" = "PROCESSED") {
    const logs = this.idempotencyLogs;
    const entry = {
      id: `idemp-${Date.now()}`,
      provider,
      eventId,
      eventType,
      processedAt: new Date().toISOString(),
      status
    };
    this.idempotencyLogs = [entry, ...logs];
    return entry;
  }

  // Current session logic (mock auth)
  get currentUser(): User | null {
    const defaultUser = this.users[0]; // default to Super Admin

    return this.getStorage("hhh_current_user", defaultUser);
  }
  set currentUser(user: User | null) {
    this.setStorage("hhh_current_user", user);
  }

  // Reset database to initial seed
  reset(): void {
    if (!isBrowser()) return;
    localStorage.removeItem("hhh_users");
    localStorage.removeItem("hhh_partners");
    localStorage.removeItem("hhh_sites");
    localStorage.removeItem("hhh_properties");
    localStorage.removeItem("hhh_reservations");
    localStorage.removeItem("hhh_rules");
    localStorage.removeItem("hhh_payouts");
    localStorage.removeItem("hhh_batches");
    localStorage.removeItem("hhh_audit_logs");
    localStorage.removeItem("hhh_notifications");
    localStorage.removeItem("hhh_current_user");
    
    // Trigger window reload to refresh state
    window.location.reload();
  }

  // CRUD helpers
  addPartner(partner: Omit<Partner, "id" | "createdAt">): Partner {
    const list = this.partners;
    const newPartner: Partner = {
      ...partner,
      id: `partner-${String(list.length + 1).padStart(3, "0")}`,
      createdAt: new Date().toISOString().split("T")[0]
    };
    this.partners = [...list, newPartner];
    this.logAction("CREATE_PARTNER", "PARTNER", newPartner.id, undefined, JSON.stringify(newPartner));
    return newPartner;
  }

  updatePartner(id: string, updates: Partial<Partner>): Partner {
    const list = this.partners;
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error("Partner not found");
    const prev = list[idx];
    const updated = { ...prev, ...updates };
    const newList = [...list];
    newList[idx] = updated;
    this.partners = newList;
    this.logAction("UPDATE_PARTNER", "PARTNER", id, JSON.stringify(prev), JSON.stringify(updated));
    return updated;
  }

  addSite(site: Omit<Site, "id" | "launchDate">): Site {
    const list = this.sites;
    const newSite: Site = {
      ...site,
      id: `site-${String(list.length + 1).padStart(3, "0")}`,
      launchDate: new Date().toISOString().split("T")[0]
    };
    this.sites = [...list, newSite];
    this.logAction("CREATE_SITE", "SITE", newSite.id, undefined, JSON.stringify(newSite));
    return newSite;
  }

  updateSite(id: string, updates: Partial<Site>): Site {
    const list = this.sites;
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) throw new Error("Site not found");
    const prev = list[idx];
    const updated = { ...prev, ...updates };
    const newList = [...list];
    newList[idx] = updated;
    this.sites = newList;
    this.logAction("UPDATE_SITE", "SITE", id, JSON.stringify(prev), JSON.stringify(updated));
    return updated;
  }

  addReservation(res: Omit<Reservation, "id" | "lastSyncedAt">): Reservation {
    const list = this.reservations;
    const newRes: Reservation = {
      ...res,
      id: `res-${String(list.length + 1).padStart(3, "0")}`,
      lastSyncedAt: new Date().toISOString()
    };
    this.reservations = [...list, newRes];
    this.logAction("SYNC_RESERVATION", "RESERVATION", newRes.id, undefined, JSON.stringify(newRes));
    return newRes;
  }

  updateReservation(id: string, updates: Partial<Reservation>): Reservation {
    const list = this.reservations;
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error("Reservation not found");
    const prev = list[idx];
    const updated = { ...prev, ...updates, lastSyncedAt: new Date().toISOString() };
    const newList = [...list];
    newList[idx] = updated;
    this.reservations = newList;
    // Log details only if critical status or attribution changes
    if (prev.reservationStatus !== updated.reservationStatus || prev.attributionStatus !== updated.attributionStatus) {
      this.logAction("UPDATE_RESERVATION", "RESERVATION", id, prev.reservationStatus + " / " + prev.attributionStatus, updated.reservationStatus + " / " + updated.attributionStatus);
    }
    return updated;
  }

  addPayout(payout: Omit<Payout, "id">): Payout {
    const list = this.payouts;
    const newPayout: Payout = {
      ...payout,
      id: `payout-${String(list.length + 1).padStart(3, "0")}`
    };
    this.payouts = [...list, newPayout];
    return newPayout;
  }

  updatePayout(id: string, updates: Partial<Payout>): Payout {
    const list = this.payouts;
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error("Payout not found");
    const prev = list[idx];
    const updated = { ...prev, ...updates };
    const newList = [...list];
    newList[idx] = updated;
    this.payouts = newList;
    return updated;
  }

  addPayoutBatch(batch: Omit<PayoutBatch, "id" | "bookingCount" | "totalPayout"> & { totalPayout: number, bookingCount: number }): PayoutBatch {
    const list = this.batches;
    const newBatch: PayoutBatch = {
      ...batch,
      id: `batch-${String(list.length + 1).padStart(3, "0")}`
    };
    this.batches = [...list, newBatch];
    this.logAction("CREATE_PAYOUT_BATCH", "PAYOUT_BATCH", newBatch.id, undefined, `Amount: $${newBatch.totalPayout}, Bookings: ${newBatch.bookingCount}`);
    return newBatch;
  }

  updatePayoutBatch(id: string, updates: Partial<PayoutBatch>): PayoutBatch {
    const list = this.batches;
    const idx = list.findIndex(b => b.id === id);
    if (idx === -1) throw new Error("Batch not found");
    const prev = list[idx];
    const updated = { ...prev, ...updates };
    const newList = [...list];
    newList[idx] = updated;
    this.batches = newList;
    this.logAction("UPDATE_PAYOUT_BATCH", "PAYOUT_BATCH", id, prev.status, updated.status);
    return updated;
  }

  addNotification(type: SystemNotification["type"], message: string): SystemNotification {
    const list = this.notifications;
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      type,
      message,
      read: false,
      createdAt: new Date().toISOString()
    };
    this.notifications = [newNotif, ...list];
    return newNotif;
  }

  markNotificationRead(id: string): void {
    this.notifications = this.notifications.map(n => n.id === id ? { ...n, read: true } : n);
  }

  private logAction(
    action: string,
    recordType: AuditLog["recordType"],
    recordId: string,
    previousValue?: string,
    updatedValue?: string
  ): void {
    const user = this.currentUser;
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      userId: user?.id || "system",
      userName: user?.name || "System Process",
      action,
      recordType,
      recordId,
      previousValue,
      updatedValue,
      createdAt: new Date().toISOString(),
      ipAddress: "127.0.0.1"
    };
    this.auditLogs = [newLog, ...this.auditLogs];
  }
}

export const db = new MockDatabase();
