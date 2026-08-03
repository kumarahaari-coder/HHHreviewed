import { createAdminClient } from "./admin";
import { User, Partner, Site, Payout, UserRole } from "@/lib/db/schema";
import { db as mockDb } from "@/lib/db/mockDb";

/**
 * DataStore Access Abstraction Layer
 * Supports production persistence via Supabase PostgreSQL and local dev fallback via mockDb.
 * Controlled strictly by DATA_STORE environment variable ("supabase" | "mock").
 */
export function isSupabaseEnabled(): boolean {
  if (process.env.NODE_ENV === "production" && process.env.DATA_STORE !== "supabase") {
    throw new Error("[DataStore Fail-Closed] Production deployment requires DATA_STORE=supabase. Fallback to mockDb in production is forbidden.");
  }
  return process.env.DATA_STORE === "supabase";
}

function assertSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[DataStore Fail-Closed] Production DATA_STORE=supabase requires valid NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  return createAdminClient();
}

/**
 * User & Authorization Queries
 */
export async function findUserByClerkUserId(clerkUserId: string): Promise<User | null> {
  if (!isSupabaseEnabled()) {
    return mockDb.users.find(u => u.clerkUserId === clerkUserId) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_user_id, onboarding_status, created_at, updated_at")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    console.error("[DataStore Error] findUserByClerkUserId failed:", error);
    throw new Error(`Failed to query user by Clerk User ID: ${error.message}`);
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

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!isSupabaseEnabled()) {
    return mockDb.users.find(u => u.email.toLowerCase().trim() === normalizedEmail) || null;
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, partner_id, status, clerk_user_id, onboarding_status, created_at, updated_at")
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

  // clerk_invitation_id is not a column in public.users DB schema
  return null;
}

/**
 * Generic Creator Invitation RPC
 */
export async function createCreatorInvitation(params: {
  internalUserId: string;
  name: string;
  email: string;
  role?: UserRole;
  partnerId?: string;
  partnerCode?: string;
  performedByUserId?: string;
  source?: string;
}): Promise<User> {
  if (!isSupabaseEnabled()) {
    const user: User = {
      id: params.internalUserId,
      name: params.name,
      email: params.email,
      role: params.role || "CREATOR",
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

export async function updateClerkInvitation(userId: string, invitationId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const u = mockDb.users.find(usr => usr.id === userId);
    if (u) {
      u.clerkInvitationId = invitationId;
      u.onboardingStatus = "INVITED";
    }
    return;
  }

  const supabase = assertSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({
      onboarding_status: "INVITED",
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    console.error("[DataStore Error] updateClerkInvitation failed:", error);
    throw new Error(`Failed to update Clerk invitation ID in Supabase: ${error.message}`);
  }
}

/**
 * Generic Clerk User Mapping RPC (Used by Webhooks, /auth/resolve, and Repairs)
 */
export async function mapClerkUser(params: {
  internalUserId?: string;
  email?: string;
  clerkUserId: string;
  partnerId?: string;
  partnerCode?: string;
  operation?: "MAP" | "REPAIR";
  performedByUserId?: string;
  source?: string;
}): Promise<User> {
  if (!isSupabaseEnabled()) {
    const u = mockDb.users.find(usr => 
      (params.internalUserId && usr.id === params.internalUserId) || 
      (params.email && usr.email.toLowerCase().trim() === params.email.toLowerCase().trim())
    );
    if (u) {
      u.clerkUserId = params.clerkUserId;
      u.onboardingStatus = "MAPPED";
      return u;
    }
    throw new Error(`[MockDb] No user found to map Clerk ID: ${params.clerkUserId}`);
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase.rpc("map_clerk_user_tx", {
    p_internal_user_id: params.internalUserId || null,
    p_email: params.email ? params.email.toLowerCase().trim() : null,
    p_exact_clerk_user_id: params.clerkUserId,
    p_partner_id: params.partnerId || null,
    p_partner_code: params.partnerCode || null,
    p_operation: params.operation || "MAP",
    p_performed_by_user_id: params.performedByUserId || null,
    p_source: params.source || "CLERK_WEBHOOK"
  });

  if (error || !data?.success) {
    console.error("[DataStore Error] map_clerk_user_tx failed:", error?.message || data?.error);
    throw new Error(`Failed to map Clerk user in Supabase: ${error?.message || data?.error || "RPC transaction failure"}`);
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

export async function deletePartner(partnerId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const idx = mockDb.partners.findIndex(p => p.id === partnerId);
    if (idx !== -1) mockDb.partners.splice(idx, 1);
    return;
  }

  const supabase = assertSupabaseClient();
  await supabase.from("partners").delete().eq("id", partnerId);
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
    return [...mockDb.partners];
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
  const { data: taxDoc } = await supabase.from("creator_tax_documents").select("*").eq("partner_id", partnerId).maybeSingle();

  return {
    partner: {
      id: partner.id,
      businessName: partner.business_name,
      contactName: partner.contact_name,
      email: partner.contact_email,
      phone: partner.phone,
      paymentMethod: partner.payment_method,
      currency: partner.currency,
      payoutFrequency: partner.payout_frequency,
      status: partner.status,
      commissionRate: Number(partner.commission_rate),
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
    reservations: (reservations || []).map(r => ({
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
      partnerPayoutAmount: Number(r.partner_payout_amount || 0),
      lastSyncedAt: r.last_synced_at
    })),
    payouts: (payouts || []).map(p => ({
      id: p.id,
      partnerId: p.partner_id,
      reservationId: p.reservation_id,
      payoutBaseAmount: Number(p.payout_base_amount),
      finalPayout: Number(p.final_payout),
      approvalDate: p.approval_date,
      transactionReference: p.transaction_reference,
      status: p.payout_status || p.status,
      createdAt: p.created_at
    })),
    statements: (statements || []).map(p => ({
      id: p.id,
      partnerId: p.partner_id,
      finalPayout: Number(p.final_payout),
      approvalDate: p.approval_date,
      transactionReference: p.transaction_reference,
      status: p.payout_status || p.status
    })),
    taxDocument: taxDoc ? {
      id: taxDoc.id,
      partnerId: taxDoc.partner_id,
      currentVersionId: taxDoc.current_version_id,
      status: taxDoc.status,
      adminNote: taxDoc.admin_note,
      internalNote: taxDoc.internal_note,
      createdAt: taxDoc.created_at,
      updatedAt: taxDoc.updated_at
    } : null
  };
}
