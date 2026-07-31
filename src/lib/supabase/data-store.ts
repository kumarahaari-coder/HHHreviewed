import { createAdminClient } from "./admin";
import { User, Partner, Site, Payout, CreatorTaxDocument, UserRole } from "@/lib/db/schema";
import { db as mockDb } from "@/lib/db/mockDb";

/**
 * DataStore Access Abstraction Layer
 * Supports production persistence via Supabase PostgreSQL and local dev fallback via mockDb.
 * Controlled strictly by DATA_STORE environment variable ("supabase" | "mock").
 */
export function isSupabaseEnabled(): boolean {
  const storeSetting = process.env.DATA_STORE || (process.env.NODE_ENV === "production" ? "supabase" : "mock");
  return storeSetting === "supabase";
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
    .select("id, name, email, role, partner_id, status, clerk_invitation_id, clerk_user_id, onboarding_status, created_at, last_login")
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
    clerkInvitationId: data.clerk_invitation_id || undefined,
    clerkUserId: data.clerk_user_id || undefined,
    onboardingStatus: data.onboarding_status,
    createdAt: data.created_at,
    lastLogin: data.last_login || undefined
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
 * Partner & Admin Operations
 */
export async function createPartnerWithUser(partnerData: any, userData: any): Promise<{ partner: Partner; user: User }> {
  if (!isSupabaseEnabled()) {
    const p = mockDb.addPartner(partnerData);
    const u: User = { ...userData, partnerId: p.id };
    mockDb.users.push(u);
    return { partner: p, user: u };
  }

  const supabase = assertSupabaseClient();
  const { data, error } = await supabase.rpc("create_partner_with_user_tx", {
    p_partner_id: partnerData.id,
    p_business_name: partnerData.businessName,
    p_contact_name: partnerData.contactName,
    p_email: partnerData.email.toLowerCase().trim(),
    p_phone: partnerData.phone || null,
    p_website: partnerData.website || null,
    p_commission_rate: Number(partnerData.commissionRate) || 10,
    p_tax_category: partnerData.taxDocumentCategory || null,
    p_notes: partnerData.notes || null,
    p_user_id: userData.id
  });

  if (error || !data?.success) {
    console.error("[DataStore Error] create_partner_with_user_tx failed:", error);
    throw new Error(`Failed atomic partner & user creation in Supabase: ${error?.message || data?.error}`);
  }

  const partnerRow = data.partner;
  const userRow = data.user;

  const partner: Partner = {
    id: partnerRow.id,
    businessName: partnerRow.business_name,
    contactName: partnerRow.contact_name,
    email: partnerRow.email,
    phone: partnerRow.phone,
    website: partnerRow.website,
    commissionRate: Number(partnerRow.commission_rate),
    status: partnerRow.status,
    paymentMethod: partnerRow.payment_method,
    currency: partnerRow.currency,
    payoutFrequency: partnerRow.payout_frequency,
    createdAt: partnerRow.created_at,
    lastLogin: partnerRow.last_login || undefined,
    notes: partnerRow.notes
  };

  const user: User = {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    partnerId: userRow.partner_id,
    status: userRow.status,
    onboardingStatus: userRow.onboarding_status,
    createdAt: userRow.created_at
  };

  return { partner, user };
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
      clerk_invitation_id: invitationId,
      onboarding_status: "INVITED",
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    console.error("[DataStore Error] updateClerkInvitation failed:", error);
    throw new Error(`Failed to update Clerk invitation ID in Supabase: ${error.message}`);
  }
}

export async function mapClerkUser(userId: string, clerkUserId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const u = mockDb.users.find(usr => usr.id === userId);
    if (u) {
      u.clerkUserId = clerkUserId;
      u.onboardingStatus = "MAPPED";
    }
    return;
  }

  const supabase = assertSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({
      clerk_user_id: clerkUserId,
      onboarding_status: "MAPPED",
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    console.error("[DataStore Error] mapClerkUser failed:", error);
    throw new Error(`Failed to map Clerk user ID in Supabase: ${error.message}`);
  }
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
  
  // Update user conditionally (only transition status if currently INVITED)
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

    await supabase
      .from("partners")
      .update({
        status: newPartnerStatus,
        last_login: now,
        updated_at: now
      })
      .eq("id", partnerId);
  }
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
  const { data: statements } = await supabase.from("payouts").select("*").eq("partner_id", partnerId).eq("status", "PAID");
  const { data: taxDoc } = await supabase.from("creator_tax_documents").select("*").eq("partner_id", partnerId).maybeSingle();

  return {
    partner: {
      id: partner.id,
      businessName: partner.business_name,
      contactName: partner.contact_name,
      email: partner.email,
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
      status: p.status,
      createdAt: p.created_at
    })),
    statements: (statements || []).map(p => ({
      id: p.id,
      partnerId: p.partner_id,
      finalPayout: Number(p.final_payout),
      approvalDate: p.approval_date,
      transactionReference: p.transaction_reference,
      status: p.status
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
