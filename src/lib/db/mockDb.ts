import type {
  User,
  Partner,
  Site,
  Property,
  Reservation,
  CommissionRule,
  Payout,
  PayoutBatch,
  AuditLog,
  SystemNotification
} from "./schema";
import { HHH_PUBLIC_PROPERTIES } from "@/lib/data/hhhProperties";

/**
 * Browser-only POC data store.
 *
 * This is intentionally retained so the Antigravity UI can be reviewed without
 * provisioning a database. Live Hospitable data can be securely fetched by a
 * server Route Handler and copied into this browser cache. It is NOT suitable
 * for production, multi-user access, webhooks, or financial recordkeeping.
 */

const INITIAL_USERS: User[] = [
  {
    id: "user-admin-1",
    name: "HHH Super Admin",
    email: "admin@hiddenhoneyhomes.com",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    createdAt: "2026-07-28"
  }
];

const INITIAL_PARTNERS: Partner[] = [];
const INITIAL_SITES: Site[] = [];
const INITIAL_RESERVATIONS: Reservation[] = [];
const INITIAL_PAYOUTS: Payout[] = [];
const INITIAL_BATCHES: PayoutBatch[] = [];
const INITIAL_AUDIT_LOGS: AuditLog[] = [];

const INITIAL_RULES: CommissionRule[] = [
  {
    id: "rule-pending-approval",
    name: "POC Hold - Commission Not Configured",
    ruleType: "PERCENTAGE_NET",
    percentage: 0,
    payoutBase: "NET_HHH",
    effectiveStartDate: "2026-07-28",
    status: "ACTIVE"
  }
];

const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: "notif-setup-required",
    type: "INFO",
    message: "Public HHH stay data is loaded. Add a regenerated Hospitable token to .env.local and run a secure sync to import live reservations.",
    read: false,
    createdAt: "2026-07-28T00:00:00Z"
  }
];

const isBrowser = () => typeof window !== "undefined";

class PocBrowserDatabase {
  private getStorage<T>(key: string, defaultValue: T): T {
    if (!isBrowser()) return defaultValue;
    const data = window.localStorage.getItem(key);
    if (!data) {
      window.localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
    try {
      return JSON.parse(data) as T;
    } catch {
      window.localStorage.setItem(key, JSON.stringify(defaultValue));
      return defaultValue;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  get users(): User[] { return this.getStorage("hhh_users", INITIAL_USERS); }
  set users(value: User[]) { this.setStorage("hhh_users", value); }

  get partners(): Partner[] { return this.getStorage("hhh_partners", INITIAL_PARTNERS); }
  set partners(value: Partner[]) { this.setStorage("hhh_partners", value); }

  get sites(): Site[] { return this.getStorage("hhh_sites", INITIAL_SITES); }
  set sites(value: Site[]) { this.setStorage("hhh_sites", value); }

  get properties(): Property[] { return this.getStorage("hhh_properties", HHH_PUBLIC_PROPERTIES); }
  set properties(value: Property[]) { this.setStorage("hhh_properties", value); }

  get reservations(): Reservation[] { return this.getStorage("hhh_reservations", INITIAL_RESERVATIONS); }
  set reservations(value: Reservation[]) { this.setStorage("hhh_reservations", value); }

  get commissionRules(): CommissionRule[] { return this.getStorage("hhh_rules", INITIAL_RULES); }
  set commissionRules(value: CommissionRule[]) { this.setStorage("hhh_rules", value); }

  get payouts(): Payout[] { return this.getStorage("hhh_payouts", INITIAL_PAYOUTS); }
  set payouts(value: Payout[]) { this.setStorage("hhh_payouts", value); }

  get batches(): PayoutBatch[] { return this.getStorage("hhh_batches", INITIAL_BATCHES); }
  set batches(value: PayoutBatch[]) { this.setStorage("hhh_batches", value); }

  get auditLogs(): AuditLog[] { return this.getStorage("hhh_audit_logs", INITIAL_AUDIT_LOGS); }
  set auditLogs(value: AuditLog[]) { this.setStorage("hhh_audit_logs", value); }

  get notifications(): SystemNotification[] { return this.getStorage("hhh_notifications", INITIAL_NOTIFICATIONS); }
  set notifications(value: SystemNotification[]) { this.setStorage("hhh_notifications", value); }

  get currentUser(): User | null {
    return this.getStorage<User | null>("hhh_current_user", this.users[0] ?? null);
  }
  set currentUser(value: User | null) { this.setStorage("hhh_current_user", value); }

  reset(): void {
    if (!isBrowser()) return;
    [
      "hhh_users",
      "hhh_partners",
      "hhh_sites",
      "hhh_properties",
      "hhh_reservations",
      "hhh_rules",
      "hhh_payouts",
      "hhh_batches",
      "hhh_audit_logs",
      "hhh_notifications",
      "hhh_current_user",
      "hhh_redirect_clicks"
    ].forEach(key => window.localStorage.removeItem(key));
    window.location.reload();
  }

  replaceProperties(properties: Property[]): void {
    this.properties = properties;
    this.logAction("SYNC_PROPERTIES", "RESERVATION", "hospitable-properties", undefined, `Imported ${properties.length} properties`);
  }

  replaceReservations(reservations: Reservation[]): void {
    this.reservations = reservations;
    this.payouts = [];
    this.batches = [];
    this.logAction("SYNC_RESERVATIONS", "RESERVATION", "hospitable-reservations", undefined, `Imported ${reservations.length} reservations`);
  }

  upsertReservations(incoming: Reservation[]): void {
    const merged = new Map(this.reservations.map(item => [item.hospitableReservationId, item]));
    incoming.forEach(item => {
      const existing = merged.get(item.hospitableReservationId);
      merged.set(item.hospitableReservationId, existing ? { ...existing, ...item, id: existing.id } : item);
    });
    this.reservations = Array.from(merged.values());
    this.logAction("SYNC_RESERVATIONS", "RESERVATION", "hospitable-reservations", undefined, `Upserted ${incoming.length} reservations`);
  }

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
    const index = list.findIndex(item => item.id === id);
    if (index < 0) throw new Error("Partner not found");
    const previous = list[index];
    const updated = { ...previous, ...updates };
    this.partners = list.map(item => item.id === id ? updated : item);
    this.logAction("UPDATE_PARTNER", "PARTNER", id, JSON.stringify(previous), JSON.stringify(updated));
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
    const index = list.findIndex(item => item.id === id);
    if (index < 0) throw new Error("Site not found");
    const previous = list[index];
    const updated = { ...previous, ...updates };
    this.sites = list.map(item => item.id === id ? updated : item);
    this.logAction("UPDATE_SITE", "SITE", id, JSON.stringify(previous), JSON.stringify(updated));
    return updated;
  }

  addReservation(reservation: Omit<Reservation, "id" | "lastSyncedAt">): Reservation {
    const list = this.reservations;
    const newReservation: Reservation = {
      ...reservation,
      id: `res-${String(list.length + 1).padStart(4, "0")}`,
      lastSyncedAt: new Date().toISOString()
    };
    this.reservations = [...list, newReservation];
    this.logAction("CREATE_RESERVATION", "RESERVATION", newReservation.id, undefined, JSON.stringify(newReservation));
    return newReservation;
  }

  updateReservation(id: string, updates: Partial<Reservation>): Reservation {
    const list = this.reservations;
    const index = list.findIndex(item => item.id === id);
    if (index < 0) throw new Error("Reservation not found");
    const previous = list[index];
    const updated = { ...previous, ...updates, lastSyncedAt: new Date().toISOString() };
    this.reservations = list.map(item => item.id === id ? updated : item);
    this.logAction("UPDATE_RESERVATION", "RESERVATION", id, JSON.stringify(previous), JSON.stringify(updated));
    return updated;
  }

  addPayout(payout: Omit<Payout, "id">): Payout {
    const newPayout = { ...payout, id: `payout-${crypto.randomUUID()}` };
    this.payouts = [...this.payouts, newPayout];
    return newPayout;
  }

  updatePayout(id: string, updates: Partial<Payout>): Payout {
    const existing = this.payouts.find(item => item.id === id);
    if (!existing) throw new Error("Payout not found");
    const updated = { ...existing, ...updates };
    this.payouts = this.payouts.map(item => item.id === id ? updated : item);
    this.logAction("UPDATE_PAYOUT", "PAYOUT", id, JSON.stringify(existing), JSON.stringify(updated));
    return updated;
  }

  addPayoutBatch(batch: Omit<PayoutBatch, "id">): PayoutBatch {
    const newBatch = { ...batch, id: `batch-${crypto.randomUUID()}` };
    this.batches = [...this.batches, newBatch];
    this.logAction("CREATE_PAYOUT_BATCH", "PAYOUT_BATCH", newBatch.id, undefined, JSON.stringify(newBatch));
    return newBatch;
  }

  updatePayoutBatch(id: string, updates: Partial<PayoutBatch>): PayoutBatch {
    const existing = this.batches.find(item => item.id === id);
    if (!existing) throw new Error("Payout batch not found");
    const updated = { ...existing, ...updates };
    this.batches = this.batches.map(item => item.id === id ? updated : item);
    this.logAction("UPDATE_PAYOUT_BATCH", "PAYOUT_BATCH", id, JSON.stringify(existing), JSON.stringify(updated));
    return updated;
  }

  addNotification(type: SystemNotification["type"], message: string): SystemNotification {
    const notification: SystemNotification = {
      id: `notif-${Date.now()}`,
      type,
      message,
      read: false,
      createdAt: new Date().toISOString()
    };
    this.notifications = [notification, ...this.notifications];
    return notification;
  }

  markNotificationRead(id: string): void {
    this.notifications = this.notifications.map(item => item.id === id ? { ...item, read: true } : item);
  }

  private logAction(
    action: string,
    recordType: AuditLog["recordType"],
    recordId: string,
    previousValue?: string,
    updatedValue?: string
  ): void {
    const user = this.currentUser;
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: user?.id ?? "system",
      userName: user?.name ?? "System",
      action,
      recordType,
      recordId,
      previousValue,
      updatedValue,
      createdAt: new Date().toISOString()
    };
    this.auditLogs = [log, ...this.auditLogs];
  }
}

export const db = new PocBrowserDatabase();
