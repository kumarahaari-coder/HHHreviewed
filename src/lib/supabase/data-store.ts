import { createAdminClient } from "./admin";
import { getTaxDocumentByPartner } from "./tax-documents";
import { User, Partner, Site, Payout, UserRole, RedirectClick, ReservationAttribution, ReconciliationStatus, Reservation, SiteReadinessStage, Property } from "@/lib/db/schema";
import { db as mockDb } from "@/lib/db/mockDb";

/**
 * DataStore Access Abstraction Layer
 * Supports production persistence via Supabase PostgreSQL and local dev fallback via mockDb.
 * Controlled strictly by DATA_STORE environment variable ("supabase" | "mock").
 */
export function isSupabaseEnabled(): boolean {
  const isNodeProd = process.env.NODE_ENV === "production";
  const isVercelProd = process.env.VERCEL_ENV === "production";

  if (isNodeProd || isVercelProd) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("[DataStore Fatal Error] Missing required Supabase environment variables in production context.");
    }
    return true;
  }

  if (process.env.DATA_STORE === "mock") return false;
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function assertSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[DataStore Error] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  return createAdminClient();
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!isSupabaseEnabled()) {
    return mockDb.users.find(u => u.email.toLowerCase().trim() === normalizedEmail) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_invitation_id, clerk_user_id, onboarding_status, created_at, last_login")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findUserByEmail failed:", error);
    throw new Error(`Failed to query user by email: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    partnerId: data.partner_id || undefined,
    status: data.status,
    clerkInvitationId: data.clerk_invitation_id || undefined,
    clerkUserId: data.clerk_user_id || undefined,
    onboardingStatus: data.onboarding_status,
    createdAt: data.created_at,
    lastLogin: data.last_login || undefined
  };
}

export async function findUserById(userId: string): Promise<User | null> {
  if (!isSupabaseEnabled()) {
    return mockDb.users.find(u => u.id === userId) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_user_id, onboarding_status, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findUserById failed:", error);
    throw new Error(`Failed to query user by ID: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    partnerId: data.partner_id || undefined,
    status: data.status,
    clerkInvitationId: undefined,
    clerkUserId: data.clerk_user_id || undefined,
    onboardingStatus: data.onboarding_status,
    createdAt: data.created_at,
    lastLogin: undefined
  };
}

export async function findUserByInvitationId(invitationId: string): Promise<User | null> {
  if (!isSupabaseEnabled()) {
    return mockDb.users.find(u => u.clerkInvitationId === invitationId) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_invitation_id, clerk_user_id, onboarding_status, created_at, last_login")
    .eq("clerk_invitation_id", invitationId)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findUserByInvitationId failed:", error);
    throw new Error(`Failed to query user by invitation ID: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    partnerId: data.partner_id || undefined,
    status: data.status,
    clerkInvitationId: data.clerk_invitation_id || undefined,
    clerkUserId: data.clerk_user_id || undefined,
    onboardingStatus: data.onboarding_status,
    createdAt: data.created_at,
    lastLogin: data.last_login || undefined
  };
}

/**
 * Generic Creator Invitation RPC
 */
export async function createCreatorInvitation(params: {
  internalUserId: string;
  name: string;
  email: string;
  partnerId?: string;
  partnerCode?: string;
  performedByUserId?: string;
  source?: string;
  role?: UserRole | string;
}): Promise<User> {
  if (!isSupabaseEnabled()) {
    const user: User = {
      id: params.internalUserId,
      name: params.name,
      email: params.email,
      role: (params.role as UserRole) || "CREATOR",
      partnerId: params.partnerId,
      status: "INVITED",
      onboardingStatus: "INVITED",
      createdAt: new Date().toISOString()
    };
    mockDb.users.push(user);
    return user;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase.rpc("create_creator_invitation_tx", {
    p_internal_user_id: params.internalUserId,
    p_name: params.name,
    p_email: params.email.toLowerCase().trim(),
    p_partner_id: params.partnerId || null,
    p_partner_code: params.partnerCode || null,
    p_performed_by_user_id: params.performedByUserId || null,
    p_source: params.source || "ADMIN_CONSOLE",
    p_role: params.role || "CREATOR"
  });

  if (error || !data?.success) {
    console.error("[DataStore Error] create_creator_invitation_tx failed:", error);
    throw new Error(`Failed creator invitation in Supabase: ${error?.message || data?.error}`);
  }

  const userRow = data.user;
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    partnerId: userRow.partner_id,
    status: userRow.status,
    onboardingStatus: userRow.onboarding_status,
    createdAt: userRow.created_at
  };
}

export async function activateUserAndPartner(userId: string, partnerId?: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseEnabled()) {
    const u = mockDb.users.find(usr => usr.id === userId);
    if (u) {
      u.lastLogin = now;
      u.onboardingStatus = "COMPLETED";
      if (u.status === "INVITED") u.status = "ACTIVE";
    }
    if (partnerId) {
      const p = mockDb.partners.find(prt => prt.id === partnerId);
      if (p) {
        p.lastLogin = now;
        if (p.status === "INVITED") p.status = "ACTIVE";
      }
    }
    return;
  }

  const supabase = assertSupabaseClient();
  
  const { data: currentUser } = await supabase.from("users").select("status").eq("id", userId).single();
  const newUserStatus = currentUser?.status === "INVITED" ? "ACTIVE" : currentUser?.status;

  await supabase
    .from("users")
    .update({
      status: newUserStatus,
      onboarding_status: "COMPLETED",
      last_login: now,
      updated_at: now
    })
    .eq("id", userId);

  if (partnerId) {
    const { data: currentPartner } = await supabase.from("partners").select("status").eq("id", partnerId).single();
    const newPartnerStatus = currentPartner?.status === "INVITED" ? "ACTIVE" : currentPartner?.status;

    if (newPartnerStatus) {
      await supabase
        .from("partners")
        .update({
          status: newPartnerStatus,
          updated_at: now
        })
        .eq("id", partnerId);
    }
  }
}

export async function createPartner(params: {
  businessName: string;
  contactName: string;
  contactEmail: string;
  partnerCode?: string;
}): Promise<Partner> {
  const normEmail = params.contactEmail.toLowerCase().trim();
  const generatedCode = params.partnerCode || `PARTNER_${Date.now().toString(36).toUpperCase()}`;

  if (!isSupabaseEnabled()) {
    const newPartner: Partner = {
      id: `partner-${Date.now().toString(36)}`,
      partnerCode: generatedCode,
      businessName: params.businessName,
      contactName: params.contactName,
      email: normEmail,
      phone: "",
      paymentMethod: "BANK_TRANSFER",
      currency: "USD",
      payoutFrequency: "MONTHLY",
      status: "INVITED",
      createdAt: new Date().toISOString()
    };
    mockDb.partners.push(newPartner);
    return newPartner;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("partners")
    .insert({
      partner_code: generatedCode,
      business_name: params.businessName,
      contact_name: params.contactName,
      contact_email: normEmail,
      status: "active" as any
    })
    .select("id, partner_code, business_name, contact_name, contact_email, status, created_at")
    .single();

  if (error) {
    console.error("[DataStore Error] createPartner failed:", error);
    throw new Error(`Failed to create partner record in Supabase: ${error.message}`);
  }

  return {
    id: data.id,
    partnerCode: data.partner_code,
    businessName: data.business_name,
    contactName: data.contact_name,
    email: data.contact_email,
    phone: "",
    paymentMethod: "BANK_TRANSFER",
    currency: "USD",
    payoutFrequency: "MONTHLY",
    status: data.status,
    createdAt: data.created_at
  };
}

export async function findPartnerById(partnerId: string): Promise<Partner | null> {
  if (!isSupabaseEnabled()) {
    return mockDb.partners.find(p => p.id === partnerId) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, partner_code, business_name, contact_name, contact_email, phone, payout_currency, payout_frequency, status, created_at")
    .eq("id", partnerId)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findPartnerById failed:", error);
    throw new Error(`Failed to query partner by ID: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    partnerCode: data.partner_code,
    businessName: data.business_name,
    contactName: data.contact_name,
    email: data.contact_email,
    phone: data.phone || "",
    paymentMethod: "BANK_TRANSFER",
    currency: data.payout_currency || "USD",
    payoutFrequency: data.payout_frequency || "MONTHLY",
    status: data.status === "active" ? "ACTIVE" : data.status === "invited" ? "INVITED" : data.status === "suspended" ? "SUSPENDED" : data.status === "archived" ? "ARCHIVED" : (data.status?.toUpperCase() as any) || "ACTIVE",
    createdAt: data.created_at
  };
}

export async function findPartnerByEmail(email: string): Promise<Partner | null> {
  const normEmail = email.toLowerCase().trim();
  if (!isSupabaseEnabled()) {
    return mockDb.partners.find(p => p.email.toLowerCase().trim() === normEmail) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, partner_code, business_name, contact_name, contact_email, phone, payout_currency, payout_frequency, status, created_at")
    .eq("contact_email", normEmail)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findPartnerByEmail failed:", error);
    throw new Error(`Failed to query partner by email: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    partnerCode: data.partner_code,
    businessName: data.business_name,
    contactName: data.contact_name,
    email: data.contact_email,
    phone: data.phone || "",
    paymentMethod: "BANK_TRANSFER",
    currency: data.payout_currency || "USD",
    payoutFrequency: data.payout_frequency || "MONTHLY",
    status: data.status === "active" ? "ACTIVE" : data.status === "invited" ? "INVITED" : data.status === "suspended" ? "SUSPENDED" : data.status === "archived" ? "ARCHIVED" : (data.status?.toUpperCase() as any) || "ACTIVE",
    createdAt: data.created_at
  };
}

export async function updatePartner(partnerId: string, updates: {
  contactName?: string;
  businessName?: string;
  phone?: string;
  status?: string;
}): Promise<Partner> {
  if (!isSupabaseEnabled()) {
    const p = mockDb.partners.find(x => x.id === partnerId);
    if (!p) throw new Error(`Partner not found: ${partnerId}`);
    if (updates.contactName !== undefined) p.contactName = updates.contactName;
    if (updates.businessName !== undefined) p.businessName = updates.businessName;
    if (updates.phone !== undefined) p.phone = updates.phone;
    if (updates.status !== undefined) p.status = updates.status as any;
    return p;
  }

  const supabase = assertSupabaseClient();
  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString()
  };
  if (updates.contactName !== undefined) dbUpdates.contact_name = updates.contactName;
  if (updates.businessName !== undefined) dbUpdates.business_name = updates.businessName;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.status !== undefined) {
    dbUpdates.status = updates.status.toLowerCase();
  }

  const { data, error } = await supabase
    .from("partners")
    .update(dbUpdates)
    .eq("id", partnerId)
    .select("id, partner_code, business_name, contact_name, contact_email, phone, payout_currency, payout_frequency, status, created_at")
    .single();

  if (error) {
    console.error("[DataStore Error] updatePartner failed:", error);
    throw new Error(`Failed to update partner: ${error.message}`);
  }

  return {
    id: data.id,
    partnerCode: data.partner_code,
    businessName: data.business_name,
    contactName: data.contact_name,
    email: data.contact_email,
    phone: data.phone || "",
    paymentMethod: "BANK_TRANSFER",
    currency: data.payout_currency || "USD",
    payoutFrequency: data.payout_frequency || "MONTHLY",
    status: data.status === "active" ? "ACTIVE" : data.status === "invited" ? "INVITED" : data.status === "suspended" ? "SUSPENDED" : data.status === "archived" ? "ARCHIVED" : (data.status?.toUpperCase() as any) || "ACTIVE",
    createdAt: data.created_at
  };
}

export async function suspendPartner(partnerId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const p = mockDb.partners.find(x => x.id === partnerId);
    if (!p) throw new Error(`Partner with ID ${partnerId} not found.`);
    p.status = "SUSPENDED";
    const u = mockDb.users.find(x => x.partnerId === partnerId);
    if (u) u.status = "SUSPENDED";
    return;
  }

  const supabase = assertSupabaseClient();
  const { error: pErr } = await supabase
    .from("partners")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", partnerId);

  if (pErr) {
    console.error("[DataStore Error] suspendPartner failed:", pErr);
    throw new Error(`Failed to suspend partner: ${pErr.message}`);
  }

  await supabase
    .from("users")
    .update({ status: "SUSPENDED", updated_at: new Date().toISOString() })
    .eq("partner_id", partnerId);
}

export async function activatePartner(partnerId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const p = mockDb.partners.find(x => x.id === partnerId);
    if (!p) throw new Error(`Partner with ID ${partnerId} not found.`);
    p.status = "ACTIVE";
    const u = mockDb.users.find(x => x.partnerId === partnerId);
    if (u) u.status = "ACTIVE";
    return;
  }

  const supabase = assertSupabaseClient();
  const { error: pErr } = await supabase
    .from("partners")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", partnerId);

  if (pErr) {
    console.error("[DataStore Error] activatePartner failed:", pErr);
    throw new Error(`Failed to activate partner: ${pErr.message}`);
  }

  await supabase
    .from("users")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("partner_id", partnerId);
}

export async function archivePartner(partnerId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const p = mockDb.partners.find(x => x.id === partnerId);
    if (!p) throw new Error(`Partner with ID ${partnerId} not found.`);
    p.status = "ARCHIVED";
    const u = mockDb.users.find(x => x.partnerId === partnerId);
    if (u) u.status = "SUSPENDED";
    return;
  }

  const supabase = assertSupabaseClient();
  const { error: pErr } = await supabase
    .from("partners")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", partnerId);

  if (pErr) {
    console.error("[DataStore Error] archivePartner failed:", pErr);
    throw new Error(`Failed to archive partner: ${pErr.message}`);
  }

  await supabase
    .from("users")
    .update({ status: "SUSPENDED", updated_at: new Date().toISOString() })
    .eq("partner_id", partnerId);
}

export async function restorePartner(partnerId: string): Promise<void> {
  return activatePartner(partnerId);
}

export async function canDeletePartner(partnerId: string): Promise<{
  canDelete: boolean;
  reason?: string;
  requiresArchive?: boolean;
  siteCount: number;
  reservationCount: number;
  ledgerCount: number;
  clickCount: number;
  linkedUserCount: number;
}> {
  const partner = await findPartnerById(partnerId);
  if (!partner) {
    return {
      canDelete: false,
      reason: `Partner with ID ${partnerId} not found.`,
      requiresArchive: false,
      siteCount: 0,
      reservationCount: 0,
      ledgerCount: 0,
      clickCount: 0,
      linkedUserCount: 0
    };
  }

  if (!isSupabaseEnabled()) {
    const siteCount = mockDb.sites.filter(s => s.partnerId === partnerId).length;
    const reservationCount = mockDb.reservations.filter(r => r.partnerId === partnerId).length;
    const ledgerCount = ((mockDb as any).commissionLedgerEvents || []).filter((l: any) => l.partnerId === partnerId).length;
    const clickCount = mockDb.redirectClicks.filter(c => c.partnerId === partnerId).length;
    const hasHistory = siteCount > 0 || reservationCount > 0 || ledgerCount > 0 || clickCount > 0;
    return {
      canDelete: !hasHistory,
      reason: hasHistory
        ? `Cannot permanently delete partner with historical records (${siteCount} site(s), ${reservationCount} booking(s), ${ledgerCount} commission ledger event(s), ${clickCount} referral click(s)). To preserve financial and attribution audit integrity, destructive deletion is blocked. Please use Archive Partner instead.`
        : undefined,
      requiresArchive: hasHistory,
      siteCount,
      reservationCount,
      ledgerCount,
      clickCount,
      linkedUserCount: 0
    };
  }

  const supabase = assertSupabaseClient();
  const [
    { count: siteCount },
    { count: resCount },
    { count: ledgerCount },
    { count: clickCount },
    { count: linkedUserCount }
  ] = await Promise.all([
    supabase.from("sites").select("*", { count: "exact", head: true }).eq("partner_id", partnerId),
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("partner_id", partnerId),
    supabase.from("commission_ledger_events").select("*", { count: "exact", head: true }).eq("partner_id", partnerId),
    supabase.from("redirect_clicks").select("*", { count: "exact", head: true }).eq("partner_id", partnerId),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("partner_id", partnerId).not("clerk_user_id", "is", null)
  ]);

  const sCount = siteCount || 0;
  const rCount = resCount || 0;
  const lCount = ledgerCount || 0;
  const cCount = clickCount || 0;
  const uCount = linkedUserCount || 0;

  if (sCount > 0 || rCount > 0 || lCount > 0 || cCount > 0 || uCount > 0) {
    const parts: string[] = [];
    if (sCount > 0) parts.push(`${sCount} site(s)`);
    if (rCount > 0) parts.push(`${rCount} booking(s)`);
    if (lCount > 0) parts.push(`${lCount} commission ledger event(s)`);
    if (cCount > 0) parts.push(`${cCount} referral click(s)`);
    if (uCount > 0) parts.push(`${uCount} active user account(s)`);

    return {
      canDelete: false,
      requiresArchive: true,
      reason: `Cannot permanently delete partner with historical records (${parts.join(", ")}). Destructive deletion is blocked to preserve historical attribution and ledger integrity. Please use Archive Partner instead.`,
      siteCount: sCount,
      reservationCount: rCount,
      ledgerCount: lCount,
      clickCount: cCount,
      linkedUserCount: uCount
    };
  }

  return {
    canDelete: true,
    requiresArchive: false,
    siteCount: 0,
    reservationCount: 0,
    ledgerCount: 0,
    clickCount: 0,
    linkedUserCount: 0
  };
}

export async function deletePartner(partnerId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  requiresArchive?: boolean;
  details?: {
    siteCount: number;
    reservationCount: number;
    ledgerCount: number;
    clickCount: number;
    linkedUserCount: number;
  };
}> {
  const check = await canDeletePartner(partnerId);
  if (!check.canDelete) {
    return {
      success: false,
      error: check.reason || "Cannot delete partner. Historical records present.",
      requiresArchive: check.requiresArchive,
      details: {
        siteCount: check.siteCount,
        reservationCount: check.reservationCount,
        ledgerCount: check.ledgerCount,
        clickCount: check.clickCount,
        linkedUserCount: check.linkedUserCount
      }
    };
  }

  if (!isSupabaseEnabled()) {
    const idx = mockDb.partners.findIndex(p => p.id === partnerId);
    if (idx !== -1) mockDb.partners.splice(idx, 1);
    return { success: true, message: "Partner record removed successfully." };
  }

  const supabase = assertSupabaseClient();
  // Delete any unlinked invited user if exists
  await supabase.from("users").delete().eq("partner_id", partnerId).eq("status", "INVITED").is("clerk_user_id", null);
  
  const { error } = await supabase.from("partners").delete().eq("id", partnerId);
  if (error) {
    console.error("[DataStore Error] deletePartner failed:", error);
    return {
      success: false,
      error: `Failed to delete partner: ${error.message}`
    };
  }

  return { success: true, message: "Partner record removed successfully." };
}

export async function getAllPartnerUsers(): Promise<User[]> {
  if (!isSupabaseEnabled()) {
    return mockDb.users.filter(u => !!u.partnerId);
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_user_id, clerk_invitation_id, onboarding_status, created_at, updated_at, password_hash")
    .not("partner_id", "is", null);

  if (error) {
    console.error("[DataStore Error] getAllPartnerUsers failed:", error);
    throw new Error(`Failed to query partner users: ${error.message}`);
  }

  return (data || []).map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    partnerId: u.partner_id || undefined,
    status: u.status,
    clerkInvitationId: u.clerk_invitation_id || undefined,
    clerkUserId: u.clerk_user_id || undefined,
    clerkId: u.clerk_user_id || undefined,
    hasPassword: Boolean(u.password_hash),
    onboardingStatus: u.onboarding_status,
    createdAt: u.created_at
  }));
}

export async function getAllPartners(): Promise<Partner[]> {
  if (!isSupabaseEnabled()) {
    return [...mockDb.partners];
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, partner_code, business_name, contact_name, contact_email, phone, payout_currency, payout_frequency, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[DataStore Error] getAllPartners failed:", error);
    throw new Error(`Failed to query partners from Supabase: ${error.message}`);
  }

  return (data || []).map(p => ({
    id: p.id,
    partnerCode: p.partner_code,
    businessName: p.business_name,
    contactName: p.contact_name,
    email: p.contact_email,
    phone: p.phone || "",
    paymentMethod: "BANK_TRANSFER",
    currency: p.payout_currency || "USD",
    payoutFrequency: p.payout_frequency || "MONTHLY",
    status: p.status === "active" ? "ACTIVE" : p.status === "invited" ? "INVITED" : p.status === "suspended" ? "SUSPENDED" : p.status === "archived" ? "ARCHIVED" : (p.status?.toUpperCase() as any) || "ACTIVE",
    createdAt: p.created_at
  }));
}
/**
 * Tenant Dashboard Data Fetcher
 */
export async function getPartnerDashboardData(partnerId: string) {
  if (!isSupabaseEnabled()) {
    const partner = mockDb.partners.find(p => p.id === partnerId);
    if (!partner) return null;
    const sites = mockDb.sites.filter(s => s.partnerId === partnerId);
    const reservations = mockDb.reservations.filter(r => r.partnerId === partnerId);
    const payouts = mockDb.payouts.filter(p => p.partnerId === partnerId);
    const statements = mockDb.payouts.filter(p => p.partnerId === partnerId && p.status === "PAID");
    const taxDocument = mockDb.getTaxDocumentByPartner(partnerId);
    return { partner, sites, reservations, payouts, statements, taxDocument };
  }

  const supabase = assertSupabaseClient();

  const { data: partner, error: partnerErr } = await supabase.from("partners").select("*").eq("id", partnerId).single();
  if (partnerErr || !partner) return null;

  const { data: sites } = await supabase.from("sites").select("*").eq("partner_id", partnerId);
  const { data: reservations } = await supabase.from("reservations").select("*").eq("partner_id", partnerId);
  const { data: payouts } = await supabase.from("payouts").select("*").eq("partner_id", partnerId);
  const { data: statements } = await supabase.from("payouts").select("*").eq("partner_id", partnerId).eq("payout_status", "PAID");
  let taxDoc: Awaited<ReturnType<typeof getTaxDocumentByPartner>> = null;
  try {
    taxDoc = await getTaxDocumentByPartner(partnerId);
  } catch (err: any) {
    console.error("[Partner Dashboard] Failed to load tax document:", err?.message);
  }

  // Authoritatively source commissions from commission_ledger_events
  const { data: ledgerEvents } = await supabase
    .from("commission_ledger_events")
    .select("reservation_id, calculated_commission, delta_amount, event_type")
    .eq("partner_id", partnerId);

  const ledgerByResId = new Map<string, number>();
  if (ledgerEvents) {
    for (const evt of ledgerEvents) {
      if (evt.reservation_id) {
        const cur = ledgerByResId.get(evt.reservation_id) || 0;
        const amt = Number(evt.calculated_commission || evt.delta_amount || 0);
        ledgerByResId.set(evt.reservation_id, cur + amt);
      }
    }
  }

  return {
    partner: {
      id: partner.id,
      businessName: partner.business_name,
      contactName: partner.contact_name,
      email: partner.contact_email,
      phone: partner.phone || "",
      paymentMethod: partner.payment_method || "BANK_TRANSFER",
      currency: partner.payout_currency || partner.currency || "USD",
      payoutFrequency: partner.payout_frequency || "MONTHLY",
      status: partner.status === "active" ? "ACTIVE" : partner.status === "invited" ? "INVITED" : partner.status === "suspended" ? "SUSPENDED" : partner.status === "archived" ? "ARCHIVED" : (partner.status?.toUpperCase() as any) || "ACTIVE",
      commissionRate: Number((partner as any).commission_rate || 0),
      createdAt: partner.created_at,
      lastLogin: partner.last_login || undefined,
      notes: partner.notes,
      website: partner.website
    },
    sites: (sites || []).map(s => ({
      id: s.id,
      partnerId: s.partner_id,
      siteName: s.site_name,
      websiteUrl: s.website_url,
      bookingUrl: s.booking_url,
      trackingCode: s.tracking_code,
      hospitableWidgetId: s.hospitable_widget_id,
      commissionRuleId: s.commission_rule_id,
      status: s.status,
      launchDate: s.launch_date
    })),
    reservations: (reservations || []).map(r => {
      const hasLedger = ledgerByResId.has(r.id);
      const ledgerCommission = ledgerByResId.get(r.id);
      const payoutAmount = hasLedger
        ? ledgerCommission
        : (r.partner_payout_amount != null ? Number(r.partner_payout_amount) : undefined);

      return {
        id: r.id,
        hospitableReservationId: r.hospitable_reservation_id,
        confirmationCode: r.confirmation_code,
        partnerId: r.partner_id,
        siteId: r.site_id,
        propertyId: r.property_id,
        guestName: r.guest_name,
        bookingDate: r.booking_date,
        checkInDate: r.check_in_date,
        checkOutDate: r.check_out_date,
        nights: r.nights,
        guests: r.guests,
        reservationStatus: r.reservation_status,
        paymentStatus: r.payment_status,
        bookingAmount: Number(r.gross_amount || 0),
        partnerPayoutAmount: payoutAmount,
        financialDataAvailable: payoutAmount !== undefined,
        lastSyncedAt: r.last_synced_at
      };
    }),
    payouts: (payouts || []).map(p => ({
      id: p.id,
      partnerId: p.partner_id,
      reservationId: p.reservation_id,
      payoutBaseAmount: Number(p.payout_base_amount || 0),
      finalPayout: Number(p.final_payout || 0),
      approvalDate: p.approval_date,
      transactionReference: p.transaction_reference,
      status: p.payout_status || p.status,
      createdAt: p.created_at
    })),
    statements: (statements || []).map(p => ({
      id: p.id,
      partnerId: p.partner_id,
      finalPayout: Number(p.final_payout || 0),
      approvalDate: p.approval_date,
      transactionReference: p.transaction_reference,
      status: p.payout_status || p.status
    })),
    // Partner-facing: the internal admin note is deliberately NOT included.
    taxDocument: taxDoc ? {
      id: taxDoc.id,
      partnerId: taxDoc.partnerId,
      currentVersionId: taxDoc.currentVersionId,
      status: taxDoc.status,
      adminNote: taxDoc.adminNote,
      createdAt: taxDoc.createdAt,
      updatedAt: taxDoc.updatedAt,
      currentVersion: taxDoc.currentVersion
        ? {
            id: taxDoc.currentVersion.id,
            versionNumber: taxDoc.currentVersion.versionNumber,
            documentType: taxDoc.currentVersion.documentType,
            w8Subtype: taxDoc.currentVersion.w8Subtype,
            originalFilename: taxDoc.currentVersion.originalFilename,
            submissionDate: taxDoc.currentVersion.submissionDate
          }
        : undefined
    } : null
  };
}

export function computeSiteReadiness(params: {
  sitePropertiesCount: number;
  clickCount: number;
  reservationCount: number;
  verifiedAttributionCount: number;
}): SiteReadinessStage {
  if (params.verifiedAttributionCount > 0) {
    return "ATTRIBUTION_VERIFIED";
  }
  if (params.clickCount > 0) {
    if (params.reservationCount > 0) {
      return "BOOKING_ATTRIBUTION_UNPROVEN";
    }
    return "CLICK_TRACKING_VERIFIED";
  }
  if (params.sitePropertiesCount > 0) {
    return "BOOKING_LINKS_CONFIGURED";
  }
  return "REGISTERED";
}

export async function getAllSites(): Promise<Site[]> {
  if (!isSupabaseEnabled()) {
    return mockDb.sites.map(s => {
      const clickCount = mockDb.redirectClicks.filter(c => c.siteId === s.id).length;
      const resCount = mockDb.reservations.filter(r => r.siteId === s.id).length;
      const ledgerCount = ((mockDb as any).commissionLedgerEvents || []).filter((l: any) => l.partnerId === s.partnerId).length;
      const stage = computeSiteReadiness({
        sitePropertiesCount: s.siteProperties?.length || 0,
        clickCount,
        reservationCount: resCount,
        verifiedAttributionCount: ledgerCount
      });
      return { ...s, readinessStage: stage };
    });
  }

  const supabase = assertSupabaseClient();
  const [
    { data: sitesData, error: sitesErr },
    { data: sitePropsData },
    { data: clicksData },
    { data: resData },
    { data: ledgerData }
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id, partner_id, site_code, site_name, website_url, tracking_code, hospitable_widget_id, status, created_at, ownerrez_listing_site_id, ownerrez_listing_site_name, ownerrez_listing_site_domain")
      .order("created_at", { ascending: false }),
    supabase
      .from("site_properties")
      .select("id, site_id, property_id, hospitable_widget_id, custom_booking_url, status, created_at"),
    supabase
      .from("redirect_clicks")
      .select("site_id"),
    supabase
      .from("reservations")
      .select("id, site_id, partner_id"),
    supabase
      .from("commission_ledger_events")
      .select("id, partner_id")
  ]);

  if (sitesErr) {
    console.error("[DataStore Error] getAllSites failed:", sitesErr);
    return [];
  }

  const sitePropertiesBySiteId = new Map<string, any[]>();
  (sitePropsData || []).forEach(sp => {
    const list = sitePropertiesBySiteId.get(sp.site_id) || [];
    list.push({
      id: sp.id,
      siteId: sp.site_id,
      propertyId: sp.property_id,
      hospitableWidgetId: sp.hospitable_widget_id || "",
      customBookingUrl: sp.custom_booking_url || undefined,
      status: sp.status === "active" ? "ACTIVE" : "INACTIVE",
      createdAt: sp.created_at
    });
    sitePropertiesBySiteId.set(sp.site_id, list);
  });

  const clickCountBySiteId = new Map<string, number>();
  (clicksData || []).forEach(c => {
    if (c.site_id) {
      clickCountBySiteId.set(c.site_id, (clickCountBySiteId.get(c.site_id) || 0) + 1);
    }
  });

  const resCountBySiteId = new Map<string, number>();
  const resCountByPartnerId = new Map<string, number>();
  (resData || []).forEach(r => {
    if (r.site_id) {
      resCountBySiteId.set(r.site_id, (resCountBySiteId.get(r.site_id) || 0) + 1);
    }
    if (r.partner_id) {
      resCountByPartnerId.set(r.partner_id, (resCountByPartnerId.get(r.partner_id) || 0) + 1);
    }
  });

  const ledgerCountByPartnerId = new Map<string, number>();
  (ledgerData || []).forEach(l => {
    if (l.partner_id) {
      ledgerCountByPartnerId.set(l.partner_id, (ledgerCountByPartnerId.get(l.partner_id) || 0) + 1);
    }
  });

  return (sitesData || []).map(s => {
    const sProps = sitePropertiesBySiteId.get(s.id) || [];
    const clickCount = clickCountBySiteId.get(s.id) || 0;
    const resCount = (resCountBySiteId.get(s.id) || 0) || (resCountByPartnerId.get(s.partner_id) || 0);
    const ledgerCount = ledgerCountByPartnerId.get(s.partner_id) || 0;

    const readinessStage = computeSiteReadiness({
      sitePropertiesCount: sProps.length,
      clickCount,
      reservationCount: resCount,
      verifiedAttributionCount: ledgerCount
    });

    return {
      id: s.id,
      partnerId: s.partner_id,
      siteName: s.site_name,
      websiteUrl: s.website_url,
      bookingUrl: s.website_url,
      trackingCode: s.tracking_code || "",
      hospitableWidgetId: s.hospitable_widget_id || "",
      status: s.status === "active" ? "ACTIVE" : "PAUSED",
      launchDate: s.created_at,
      readinessStage,
      ownerrezListingSiteId: s.ownerrez_listing_site_id ? Number(s.ownerrez_listing_site_id) : undefined,
      ownerrezListingSiteName: s.ownerrez_listing_site_name || undefined,
      ownerrezListingSiteDomain: s.ownerrez_listing_site_domain || undefined,
      siteProperties: sProps
    };
  });
}

export interface CreateReferralSiteParams {
  partnerId: string;
  siteName: string;
  websiteUrl: string;
  trackingCode: string;
  mappings?: Array<{
    propertyId: string;
    customBookingUrl?: string;
    hospitableWidgetId?: string;
  }>;
}

export const CANONICAL_PROPERTY_UUIDS = new Set([
  "38d9159e-a35d-405e-826e-7381ad3c3197", // Uptown St. Augustine
  "f0fb867d-47cd-47d4-afa6-c4bf226c1768", // Downtown St. Augustine (Lincoln)
  "51be6158-268d-4c96-8f0b-9968f544ddfa", // Ellsworth, Maine
  "55791a54-b1a3-459e-bbd5-9073a418b774"  // Beech Mountain, NC
]);

/**
 * site_properties.property_id is a FK to properties(id). If the core properties are missing
 * (fresh or wiped database) the insert fails with an opaque FK violation, so check up front.
 */
async function assertCorePropertiesExist(supabase: any, propertyIds: string[]): Promise<void> {
  if (propertyIds.length === 0) return;
  const { data, error } = await supabase.from("properties").select("id").in("id", propertyIds);
  if (error) {
    throw new Error(`Failed to verify properties: ${error.message}`);
  }
  const found = new Set((data || []).map((r: { id: string }) => r.id));
  const missing = propertyIds.filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Property record(s) missing from the database: ${missing.join(", ")}. ` +
      `Apply supabase/migrations/20261014_seed_core_properties.sql to seed the core properties.`
    );
  }
}

export async function createReferralSite(params: CreateReferralSiteParams): Promise<Site> {
  const partner = await findPartnerById(params.partnerId);
  if (!partner) {
    throw new Error(`Partner with ID "${params.partnerId}" not found.`);
  }

  const cleanUrl = params.websiteUrl.toLowerCase().trim().startsWith("http")
    ? params.websiteUrl.toLowerCase().trim()
    : `https://${params.websiteUrl.toLowerCase().trim()}`;
  const cleanCode = params.trackingCode.toUpperCase().trim();

  if (!cleanCode) {
    throw new Error("Tracking Code is required.");
  }

  const validatedMappings: Array<{
    propertyId: string;
    customBookingUrl?: string;
    hospitableWidgetId: string;
  }> = [];

  if (params.mappings && Array.isArray(params.mappings) && params.mappings.length > 0) {
    const seenProperties = new Set<string>();

    for (const m of params.mappings) {
      if (!m.propertyId || !CANONICAL_PROPERTY_UUIDS.has(m.propertyId)) {
        throw new Error(`Invalid property UUID "${m.propertyId}". Must match one of the 4 canonical properties.`);
      }
      if (seenProperties.has(m.propertyId)) {
        throw new Error(`Duplicate mapping submitted for property ${m.propertyId}. Each property may only be mapped once.`);
      }
      seenProperties.add(m.propertyId);

      const bookingUrl = m.customBookingUrl?.trim() || undefined;
      const widgetId = m.hospitableWidgetId?.trim() || "hostaway-direct";

      if (!bookingUrl && !m.hospitableWidgetId) {
        throw new Error(`A destination booking URL or widget ID is required for property ${m.propertyId}.`);
      }

      validatedMappings.push({
        propertyId: m.propertyId,
        customBookingUrl: bookingUrl,
        hospitableWidgetId: widgetId
      });
    }
  }

  if (!isSupabaseEnabled()) {
    if (mockDb.sites.some(s => s.trackingCode.toUpperCase() === cleanCode)) {
      throw new Error(`Tracking code "${cleanCode}" is already registered.`);
    }

    const newSiteId = `site-${Date.now().toString(36)}`;
    const siteProps = validatedMappings.map((m, idx) => ({
      id: `sp-${Date.now()}-${idx}`,
      siteId: newSiteId,
      propertyId: m.propertyId,
      hospitableWidgetId: m.hospitableWidgetId,
      customBookingUrl: m.customBookingUrl,
      status: "ACTIVE" as const
    }));

    const newSite: Site = {
      id: newSiteId,
      partnerId: params.partnerId,
      siteName: params.siteName.trim(),
      websiteUrl: cleanUrl,
      bookingUrl: cleanUrl,
      hospitableWidgetId: validatedMappings[0]?.hospitableWidgetId || "",
      trackingCode: cleanCode,
      status: "ACTIVE",
      launchDate: new Date().toISOString(),
      siteProperties: siteProps,
      readinessStage: siteProps.length > 0 ? "BOOKING_LINKS_CONFIGURED" : "REGISTERED"
    };

    mockDb.sites.push(newSite);
    return newSite;
  }

  const supabase = assertSupabaseClient();

  // Check unique tracking code
  const { data: existingCode } = await supabase
    .from("sites")
    .select("id, tracking_code")
    .or(`tracking_code.ilike.${cleanCode},site_code.ilike.SITE_${cleanCode}`)
    .maybeSingle();

  if (existingCode) {
    throw new Error(`Tracking code "${cleanCode}" is already registered.`);
  }

  await assertCorePropertiesExist(supabase, validatedMappings.map(m => m.propertyId));

  const siteCode = `SITE_${cleanCode}`;
  const { data: siteRow, error: siteInsertErr } = await supabase
    .from("sites")
    .insert({
      partner_id: params.partnerId,
      site_code: siteCode,
      site_name: params.siteName.trim(),
      website_url: cleanUrl,
      tracking_code: cleanCode,
      status: "active" as any
    })
    .select("*")
    .single();

  if (siteInsertErr || !siteRow) {
    throw new Error(`Failed to create site record in Supabase: ${siteInsertErr?.message || "Insert failed"}`);
  }

  let createdProps: any[] = [];
  if (validatedMappings.length > 0) {
    const sitePropRows = validatedMappings.map(m => ({
      site_id: siteRow.id,
      property_id: m.propertyId,
      hospitable_widget_id: m.hospitableWidgetId || "hostaway-direct",
      custom_booking_url: m.customBookingUrl,
      status: "active" as any
    }));

    const { data: propsData, error: propsInsertErr } = await supabase
      .from("site_properties")
      .insert(sitePropRows)
      .select("*");

    if (propsInsertErr) {
      await supabase.from("sites").delete().eq("id", siteRow.id);
      throw new Error(`Failed to create site_properties mappings. Site creation rolled back: ${propsInsertErr.message}`);
    }
    createdProps = propsData || [];
  }

  const readinessStage: SiteReadinessStage = createdProps.length > 0 ? "BOOKING_LINKS_CONFIGURED" : "REGISTERED";

  return {
    id: siteRow.id,
    partnerId: siteRow.partner_id,
    siteName: siteRow.site_name,
    websiteUrl: siteRow.website_url,
    bookingUrl: siteRow.website_url,
    trackingCode: siteRow.tracking_code,
    hospitableWidgetId: createdProps[0]?.hospitable_widget_id || "",
    status: "ACTIVE",
    launchDate: siteRow.created_at,
    readinessStage,
    siteProperties: createdProps.map(p => ({
      id: p.id,
      siteId: p.site_id,
      propertyId: p.property_id,
      hospitableWidgetId: p.hospitable_widget_id,
      customBookingUrl: p.custom_booking_url,
      status: "ACTIVE"
    }))
  };
}

export async function createSiteWithFourPropertyMappings(params: {
  partnerId: string;
  siteName: string;
  websiteUrl: string;
  trackingCode: string;
  mappings: { propertyId: string; hospitableWidgetId: string }[];
}): Promise<Site> {
  const { validateFourPropertyWidgetMappings } = await import("@/lib/hospitable/widgets");
  const validation = validateFourPropertyWidgetMappings(params.mappings);

  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
  }

  return createReferralSite({
    partnerId: params.partnerId,
    siteName: params.siteName,
    websiteUrl: params.websiteUrl,
    trackingCode: params.trackingCode,
    mappings: validation.validatedMappings!.map(m => ({
      propertyId: m.propertyId,
      customBookingUrl: m.customBookingUrl,
      hospitableWidgetId: m.hospitableWidgetId
    }))
  });
}

export async function updateSitePropertyMappings(
  siteId: string,
  mappings: Array<{ propertyId: string; customBookingUrl?: string; hospitableWidgetId?: string }>
): Promise<Site> {
  const seen = new Set<string>();
  for (const m of mappings) {
    if (!m.propertyId || !CANONICAL_PROPERTY_UUIDS.has(m.propertyId)) {
      throw new Error(`Invalid property UUID "${m.propertyId}". Must match one of the 4 canonical properties.`);
    }
    if (seen.has(m.propertyId)) {
      throw new Error(`Duplicate mapping submitted for property ${m.propertyId}.`);
    }
    seen.add(m.propertyId);
  }

  if (!isSupabaseEnabled()) {
    const site = mockDb.sites.find(s => s.id === siteId);
    if (!site) throw new Error(`Site with ID "${siteId}" not found.`);
    site.siteProperties = mappings.map((m, idx) => ({
      id: `sp-${siteId}-${idx}`,
      siteId,
      propertyId: m.propertyId,
      hospitableWidgetId: m.hospitableWidgetId || "hostaway-direct",
      customBookingUrl: m.customBookingUrl,
      status: "ACTIVE" as const
    }));
    return site;
  }

  const supabase = assertSupabaseClient();
  const { data: siteRow, error: siteErr } = await supabase
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle();

  if (siteErr || !siteRow) {
    throw new Error(`Site with ID "${siteId}" not found.`);
  }

  await assertCorePropertiesExist(supabase, mappings.map(m => m.propertyId));

  // Upsert first, then prune: a failed write must never leave the site with its mappings wiped.
  if (mappings.length > 0) {
    const rows = mappings.map(m => ({
      site_id: siteId,
      property_id: m.propertyId,
      hospitable_widget_id: m.hospitableWidgetId || "hostaway-direct",
      custom_booking_url: m.customBookingUrl,
      status: "active" as any
    }));
    const { error: upsertErr } = await supabase
      .from("site_properties")
      .upsert(rows, { onConflict: "site_id,property_id" });
    if (upsertErr) {
      throw new Error(`Failed to update site properties: ${upsertErr.message}`);
    }
  }

  const keepIds = mappings.map(m => m.propertyId);
  let pruneQuery = supabase.from("site_properties").delete().eq("site_id", siteId);
  if (keepIds.length > 0) {
    pruneQuery = pruneQuery.not("property_id", "in", `(${keepIds.join(",")})`);
  }
  const { error: pruneErr } = await pruneQuery;
  if (pruneErr) {
    throw new Error(`Failed to remove unselected site properties: ${pruneErr.message}`);
  }

  const allSites = await getAllSites();
  const updatedSite = allSites.find(s => s.id === siteId);
  if (!updatedSite) {
    throw new Error("Failed to reload updated site.");
  }
  return updatedSite;
}

/**
 * Click Tracking Persistence Layer
 */
export async function recordRedirectClick(click: Omit<RedirectClick, "id" | "createdAt">): Promise<RedirectClick> {
  if (!isSupabaseEnabled()) {
    return mockDb.addRedirectClick(click);
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("redirect_clicks")
    .insert({
      site_id: click.siteId,
      partner_id: click.partnerId,
      property_id: click.propertyId,
      site_property_id: click.sitePropertyId || null,
      tracking_code: click.trackingCode,
      widget_url: click.widgetUrl,
      anonymous_session_id: click.anonymousSessionId,
      referrer_url: click.referrerUrl || null,
      user_agent_summary: click.userAgentSummary || null,
      ip_hash: click.ipHash || null,
      clicked_at: click.clickedAt,
      expires_at: click.expiresAt
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[DataStore Error] recordRedirectClick failed:", error);
    throw new Error(`Failed to record redirect click: ${error?.message || "Insert failed"}`);
  }

  return {
    id: data.id,
    siteId: data.site_id,
    partnerId: data.partner_id,
    propertyId: data.property_id,
    sitePropertyId: data.site_property_id || undefined,
    trackingCode: data.tracking_code,
    widgetUrl: data.widget_url,
    anonymousSessionId: data.anonymous_session_id,
    referrerUrl: data.referrer_url || undefined,
    userAgentSummary: data.user_agent_summary || undefined,
    ipHash: data.ip_hash || undefined,
    clickedAt: data.clicked_at,
    expiresAt: data.expires_at,
    createdAt: data.created_at
  };
}

export async function getRedirectClicksForPropertyWindow(
  propertyId: string,
  startTime: string,
  endTime: string
): Promise<RedirectClick[]> {
  if (!isSupabaseEnabled()) {
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    return mockDb.redirectClicks.filter(c => {
      if (c.propertyId !== propertyId) return false;
      const cMs = new Date(c.clickedAt).getTime();
      return cMs >= startMs && cMs <= endMs;
    });
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("redirect_clicks")
    .select("*")
    .eq("property_id", propertyId)
    .gte("clicked_at", startTime)
    .lte("clicked_at", endTime)
    .order("clicked_at", { ascending: false });

  if (error) {
    console.error("[DataStore Error] getRedirectClicksForPropertyWindow failed:", error);
    throw new Error(`Failed to fetch clicks for property window: ${error.message}`);
  }

  return (data || []).map(d => ({
    id: d.id,
    siteId: d.site_id,
    partnerId: d.partner_id,
    propertyId: d.property_id,
    sitePropertyId: d.site_property_id || undefined,
    trackingCode: d.tracking_code,
    widgetUrl: d.widget_url,
    anonymousSessionId: d.anonymous_session_id,
    referrerUrl: d.referrer_url || undefined,
    userAgentSummary: d.user_agent_summary || undefined,
    ipHash: d.ip_hash || undefined,
    clickedAt: d.clicked_at,
    expiresAt: d.expires_at,
    createdAt: d.created_at
  }));
}

export async function getClickAnalyticsSummary(): Promise<{
  totalClicks: number;
  clicksBySite: { siteId: string; siteName: string; count: number }[];
  clicksByPartner: { partnerId: string; partnerName: string; count: number }[];
  clicksByProperty: { propertyId: string; propertyName: string; count: number }[];
  dailyTrends: { date: string; count: number }[];
  recentClicks: RedirectClick[];
}> {
  let clicks: RedirectClick[] = [];
  let sites: Site[] = [];
  let partners: Partner[] = [];

  if (!isSupabaseEnabled()) {
    clicks = mockDb.redirectClicks;
    sites = mockDb.sites;
    partners = mockDb.partners;
  } else {
    const supabase = assertSupabaseClient();
    const [clicksRes, sitesRes, partnersRes] = await Promise.all([
      supabase.from("redirect_clicks").select("*").order("clicked_at", { ascending: false }).limit(500),
      supabase.from("sites").select("id, site_name, partner_id"),
      supabase.from("partners").select("id, partner_name")
    ]);

    clicks = (clicksRes.data || []).map(d => ({
      id: d.id,
      siteId: d.site_id,
      partnerId: d.partner_id,
      propertyId: d.property_id,
      sitePropertyId: d.site_property_id || undefined,
      trackingCode: d.tracking_code,
      widgetUrl: d.widget_url,
      anonymousSessionId: d.anonymous_session_id,
      referrerUrl: d.referrer_url || undefined,
      userAgentSummary: d.user_agent_summary || undefined,
      ipHash: d.ip_hash || undefined,
      clickedAt: d.clicked_at,
      expiresAt: d.expires_at,
      createdAt: d.created_at
    }));

    sites = (sitesRes.data || []).map(s => ({
      id: s.id,
      partnerId: s.partner_id,
      siteName: s.site_name,
      websiteUrl: "",
      hospitableWidgetId: "",
      bookingUrl: "",
      trackingCode: "",
      status: "ACTIVE" as any,
      launchDate: ""
    }));

    partners = (partnersRes.data || []).map((p: any) => ({
      id: p.id,
      businessName: p.business_name || p.partner_name || "Partner",
      contactName: p.contact_name || p.partner_name || "Partner",
      email: p.email || "",
      phone: p.phone || "",
      paymentMethod: "BANK_TRANSFER" as any,
      currency: "USD",
      payoutFrequency: "MONTHLY" as any,
      status: "ACTIVE" as any,
      createdAt: ""
    }));
  }

  const siteMap = new Map(sites.map(s => [s.id, s.siteName]));
  const partnerMap = new Map(partners.map(p => [p.id, p.businessName || p.contactName]));

  const propertyNames: Record<string, string> = {
    "38d9159e-a35d-405e-826e-7381ad3c3197": "Uptown St. Augustine",
    "f0fb867d-47cd-47d4-afa6-c4bf226c1768": "Downtown St. Augustine",
    "51be6158-268d-4c96-8f0b-9968f544ddfa": "Ellsworth, Maine",
    "55791a54-b1a3-459e-bbd5-9073a418b774": "Beech Mountain, NC",
    "prop-001": "Uptown Retreat",
    "prop-002": "Downtown Retreat",
    "prop-003": "Ellsworth Retreat",
    "prop-004": "Beech Mountain Retreat"
  };

  // Group by site
  const siteCounts: Record<string, number> = {};
  const partnerCounts: Record<string, number> = {};
  const propCounts: Record<string, number> = {};
  const dailyCounts: Record<string, number> = {};

  for (const c of clicks) {
    siteCounts[c.siteId] = (siteCounts[c.siteId] || 0) + 1;
    partnerCounts[c.partnerId] = (partnerCounts[c.partnerId] || 0) + 1;
    propCounts[c.propertyId] = (propCounts[c.propertyId] || 0) + 1;

    const day = c.clickedAt.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  }

  return {
    totalClicks: clicks.length,
    clicksBySite: Object.entries(siteCounts).map(([siteId, count]) => ({
      siteId,
      siteName: siteMap.get(siteId) || siteId,
      count
    })).sort((a, b) => b.count - a.count),
    clicksByPartner: Object.entries(partnerCounts).map(([partnerId, count]) => ({
      partnerId,
      partnerName: partnerMap.get(partnerId) || partnerId,
      count
    })).sort((a, b) => b.count - a.count),
    clicksByProperty: Object.entries(propCounts).map(([propertyId, count]) => ({
      propertyId,
      propertyName: propertyNames[propertyId] || propertyId,
      count
    })).sort((a, b) => b.count - a.count),
    dailyTrends: Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => a.date.localeCompare(b.date)),
    recentClicks: clicks.slice(0, 50)
  };
}

/**
 * Reservation Attributions Persistence Layer
 */
export async function saveReservationAttribution(
  attr: Omit<ReservationAttribution, "id" | "createdAt" | "updatedAt">
): Promise<ReservationAttribution> {
  if (!isSupabaseEnabled()) {
    return mockDb.saveReservationAttribution(attr);
  }

  const supabase = assertSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reservation_attributions")
    .upsert({
      reservation_id: attr.reservationId,
      site_id: attr.siteId || null,
      partner_id: attr.partnerId || null,
      site_property_id: attr.sitePropertyId || null,
      click_id: attr.clickId || null,
      attribution_method: attr.attributionMethod,
      confidence_score: attr.confidenceScore,
      matched_signals: attr.matchedSignals,
      competing_candidates: attr.competingCandidates || [],
      status: attr.status,
      reviewed_by: attr.reviewedBy || null,
      reviewed_at: attr.reviewedAt || null,
      updated_at: now
    }, {
      onConflict: "reservation_id"
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[DataStore Error] saveReservationAttribution failed:", error);
    throw new Error(`Failed to save reservation attribution: ${error?.message || "Upsert failed"}`);
  }

  return {
    id: data.id,
    reservationId: data.reservation_id,
    siteId: data.site_id || undefined,
    partnerId: data.partner_id || undefined,
    sitePropertyId: data.site_property_id || undefined,
    clickId: data.click_id || undefined,
    attributionMethod: data.attribution_method,
    confidenceScore: Number(data.confidence_score),
    matchedSignals: data.matched_signals || [],
    competingCandidates: data.competing_candidates || [],
    status: data.status,
    reviewedBy: data.reviewed_by || undefined,
    reviewedAt: data.reviewed_at || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

export async function getReservationAttributions(): Promise<ReservationAttribution[]> {
  if (!isSupabaseEnabled()) {
    return mockDb.reservationAttributions;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_attributions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[DataStore Error] getReservationAttributions failed:", error);
    throw new Error(`Failed to fetch reservation attributions: ${error.message}`);
  }

  return (data || []).map(d => ({
    id: d.id,
    reservationId: d.reservation_id,
    siteId: d.site_id || undefined,
    partnerId: d.partner_id || undefined,
    sitePropertyId: d.site_property_id || undefined,
    clickId: d.click_id || undefined,
    attributionMethod: d.attribution_method,
    confidenceScore: Number(d.confidence_score),
    matchedSignals: d.matched_signals || [],
    competingCandidates: d.competing_candidates || [],
    status: d.status,
    reviewedBy: d.reviewed_by || undefined,
    reviewedAt: d.reviewed_at || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  }));
}

export async function getReservationAttributionByReservationId(
  reservationId: string
): Promise<ReservationAttribution | null> {
  if (!isSupabaseEnabled()) {
    return mockDb.reservationAttributions.find(a => a.reservationId === reservationId) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_attributions")
    .select("*")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] getReservationAttributionByReservationId failed:", error);
    throw new Error(`Failed to fetch attribution for reservation: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    reservationId: data.reservation_id,
    siteId: data.site_id || undefined,
    partnerId: data.partner_id || undefined,
    sitePropertyId: data.site_property_id || undefined,
    clickId: data.click_id || undefined,
    attributionMethod: data.attribution_method,
    confidenceScore: Number(data.confidence_score),
    matchedSignals: data.matched_signals || [],
    competingCandidates: data.competing_candidates || [],
    status: data.status,
    reviewedBy: data.reviewed_by || undefined,
    reviewedAt: data.reviewed_at || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

export async function updateReservationAttributionStatus(
  id: string,
  status: ReconciliationStatus,
  reviewedBy?: string
): Promise<ReservationAttribution> {
  if (!isSupabaseEnabled()) {
    const list = mockDb.reservationAttributions;
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) throw new Error(`Attribution record ${id} not found in mockDb`);
    const updated: ReservationAttribution = {
      ...list[idx],
      status,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    mockDb.reservationAttributions = [...list];
    return updated;
  }

  const supabase = assertSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reservation_attributions")
    .update({
      status,
      reviewed_by: reviewedBy || null,
      reviewed_at: now,
      updated_at: now
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[DataStore Error] updateReservationAttributionStatus failed:", error);
    throw new Error(`Failed to update attribution status: ${error?.message || "Update failed"}`);
  }

  return {
    id: data.id,
    reservationId: data.reservation_id,
    siteId: data.site_id || undefined,
    partnerId: data.partner_id || undefined,
    sitePropertyId: data.site_property_id || undefined,
    clickId: data.click_id || undefined,
    attributionMethod: data.attribution_method,
    confidenceScore: Number(data.confidence_score),
    matchedSignals: data.matched_signals || [],
    competingCandidates: data.competing_candidates || [],
    status: data.status,
    reviewedBy: data.reviewed_by || undefined,
    reviewedAt: data.reviewed_at || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

export async function getAdminReservations(): Promise<Reservation[]> {
  if (!isSupabaseEnabled()) {
    return mockDb.reservations;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("check_in_date", { ascending: false });

  if (error) {
    console.error("[DataStore Error] getAdminReservations failed:", error);
    throw new Error(`Failed to fetch admin reservations: ${error.message}`);
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    hospitableReservationId: r.hospitable_reservation_id || undefined,
    ownerrezBookingId: r.ownerrez_booking_id ? Number(r.ownerrez_booking_id) : undefined,
    hostawayReservationId: r.hostaway_reservation_id ? Number(r.hostaway_reservation_id) : undefined,
    quoteId: r.quote_id ? Number(r.quote_id) : undefined,
    confirmationCode: r.confirmation_code,
    propertyId: r.property_id,
    partnerId: r.partner_id || undefined,
    siteId: r.site_id || undefined,
    guestName: r.guest_name || undefined,
    guestEmail: r.guest_email || undefined,
    bookingDate: r.booking_date || undefined,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    nights: Number(r.nights || 0),
    guests: Number(r.guests || 0),
    reservationStatus: r.reservation_status,
    paymentStatus: r.payment_status,
    grossAmount: Number(r.gross_amount || 0),
    amountReceived: Number(r.amount_received || 0),
    refundAmount: Number(r.refund_amount || 0),
    cleaningFee: Number(r.cleaning_fee || 0),
    serviceFee: Number(r.service_fee || 0),
    taxesAmount: Number(r.taxes_amount || 0),
    bookingAmount: Number(r.gross_amount || 0),
    payoutAmount: 0,
    payoutStatus: "ESTIMATED",
    commissionRate: 0,
    status: r.reservation_status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    currency: r.currency || "USD",
    platform: (r.platform && r.platform !== "ownerrez" && r.platform !== "hostaway") ? r.platform : (r.ownerrez_booking_id || r.hostaway_reservation_id ? "direct" : (r.platform || undefined)),
    sourceProvider: (r.payment_confirmation_source && r.payment_confirmation_source.trim() !== "") ? r.payment_confirmation_source.toLowerCase() : (r.hostaway_reservation_id ? "hostaway" : (r.ownerrez_booking_id ? "ownerrez" : "unknown")),
    paymentConfirmationSource: r.payment_confirmation_source || undefined,
    attributionStatus: r.attribution_status,
    financialDataAvailable: Boolean(r.financial_data_available),
    lastSyncedAt: r.last_synced_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })) as Reservation[];
}



export async function getAdminProperties(): Promise<Property[]> {
  if (!isSupabaseEnabled()) {
    return mockDb.properties;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("property_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    hospitablePropertyId: r.hospitable_property_id || "",
    name: r.property_name,
    location: r.location || "",
    timezone: r.timezone || "",
    imageUrl: r.image_url || undefined,
    status: String(r.status).toLowerCase() === "active" ? "ACTIVE" : "INACTIVE",
    websiteUrl: r.website_url || undefined,
    bookingUrl: r.booking_url || undefined,
    summary: r.summary || undefined,
  })) as Property[];
}
