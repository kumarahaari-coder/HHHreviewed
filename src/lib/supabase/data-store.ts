import { createAdminClient } from "./admin";
import { User, Partner, Site, Payout, UserRole, RedirectClick, ReservationAttribution, ReconciliationStatus, Reservation } from "@/lib/db/schema";
import { db as mockDb } from "@/lib/db/mockDb";

/**
 * DataStore Access Abstraction Layer
 * Supports production persistence via Supabase PostgreSQL and local dev fallback via mockDb.
 * Controlled strictly by DATA_STORE environment variable ("supabase" | "mock").
 */
export function isSupabaseEnabled(): boolean {
  if (process.env.DATA_STORE === "mock") return false;
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function assertSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[DataStore Error] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
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
    const errMessage = error?.message || data?.error || "";
    // Clean Multi-Role Mapping: If remote RPC has legacy CREATOR role restriction, perform standard data store user mapping for all supported roles
    if (errMessage.includes("expected CREATOR") || errMessage.includes("invalid role")) {
      let targetUser = null;
      if (params.internalUserId) {
        targetUser = await findUserById(params.internalUserId);
      }
      if (!targetUser && params.email) {
        targetUser = await findUserByEmail(params.email);
      }

      if (targetUser && ["SUPER_ADMIN", "FINANCE_ADMIN", "ADMIN", "PARTNER_OWNER", "CREATOR"].includes(targetUser.role)) {
        const { data: updatedData, error: updateErr } = await supabase
          .from("users")
          .update({
            clerk_user_id: params.clerkUserId,
            onboarding_status: "MAPPED",
            status: targetUser.status === "INVITED" ? "ACTIVE" : targetUser.status,
            updated_at: new Date().toISOString()
          })
          .eq("id", targetUser.id)
          .select("id, name, email, role, partner_id, status, clerk_user_id, onboarding_status, created_at, updated_at")
          .single();

        if (!updateErr && updatedData) {
          // Log audit entry
          await supabase.from("application_audit_logs").insert({
            action: "USER_CLERK_IDENTITY_MAPPED",
            target_user_id: updatedData.id,
            partner_id: updatedData.partner_id,
            performed_by_user_id: params.performedByUserId || "SYSTEM",
            source: params.source || "AUTH_RESOLVER",
            details: {
              email: updatedData.email,
              role: updatedData.role,
              clerkUserId: params.clerkUserId,
              operation: params.operation || "MAP"
            }
          });

          return {
            id: updatedData.id,
            name: updatedData.name,
            email: updatedData.email,
            role: updatedData.role as UserRole,
            partnerId: updatedData.partner_id || undefined,
            status: updatedData.status,
            clerkUserId: updatedData.clerk_user_id || undefined,
            onboardingStatus: updatedData.onboarding_status,
            createdAt: updatedData.created_at
          };
        }
      }
    }

    console.error("[DataStore Error] map_clerk_user_tx failed:", errMessage);
    throw new Error(`Failed to map Clerk user in Supabase: ${errMessage || "RPC transaction failure"}`);
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

export async function getAllSites(): Promise<Site[]> {
  if (!isSupabaseEnabled()) {
    return [...mockDb.sites];
  }

  const supabase = assertSupabaseClient();
  const { data: sitesData, error: sitesErr } = await supabase
    .from("sites")
    .select("id, partner_id, site_code, site_name, website_url, tracking_code, hospitable_widget_id, status, created_at")
    .order("created_at", { ascending: false });

  if (sitesErr) {
    console.error("[DataStore Error] getAllSites failed:", sitesErr);
    return [];
  }

  const { data: sitePropsData } = await supabase
    .from("site_properties")
    .select("id, site_id, property_id, status, created_at");

  const sitePropertiesBySiteId = new Map<string, any[]>();
  (sitePropsData || []).forEach(sp => {
    const list = sitePropertiesBySiteId.get(sp.site_id) || [];
    list.push({
      id: sp.id,
      siteId: sp.site_id,
      propertyId: sp.property_id,
      hospitableWidgetId: "",
      customBookingUrl: undefined,
      status: sp.status === "active" ? "ACTIVE" : "INACTIVE",
      createdAt: sp.created_at
    });
    sitePropertiesBySiteId.set(sp.site_id, list);
  });

  return (sitesData || []).map(s => ({
    id: s.id,
    partnerId: s.partner_id,
    siteName: s.site_name,
    websiteUrl: s.website_url,
    bookingUrl: s.website_url,
    trackingCode: s.tracking_code || "",
    hospitableWidgetId: s.hospitable_widget_id || "",
    status: s.status === "active" ? "ACTIVE" : "PAUSED",
    launchDate: s.created_at,
    siteProperties: sitePropertiesBySiteId.get(s.id) || []
  }));
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

  const cleanUrl = params.websiteUrl.toLowerCase().trim().startsWith("http")
    ? params.websiteUrl.toLowerCase().trim()
    : `https://${params.websiteUrl.toLowerCase().trim()}`;
  const cleanCode = params.trackingCode.toUpperCase().trim();

  if (!isSupabaseEnabled()) {
    const newSiteId = `site-${Date.now().toString(36)}`;
    const siteProps = validation.validatedMappings!.map((m, idx) => ({
      id: `sp-${Date.now()}-${idx}`,
      siteId: newSiteId,
      propertyId: m.propertyId,
      hospitableWidgetId: m.hospitableWidgetId,
      status: "ACTIVE" as const
    }));

    const newSite: Site = {
      id: newSiteId,
      partnerId: params.partnerId,
      siteName: params.siteName.trim(),
      websiteUrl: cleanUrl,
      bookingUrl: cleanUrl,
      hospitableWidgetId: validation.validatedMappings![0].hospitableWidgetId,
      trackingCode: cleanCode,
      status: "ACTIVE",
      launchDate: new Date().toISOString(),
      siteProperties: siteProps
    };

    mockDb.sites.push(newSite);
    return newSite;
  }

  const supabase = assertSupabaseClient();

  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_referral_site_tx", {
    p_partner_id: params.partnerId,
    p_site_name: params.siteName.trim(),
    p_website_url: cleanUrl,
    p_tracking_code: cleanCode,
    p_mappings: validation.validatedMappings
  });

  if (!rpcErr && rpcData?.success && rpcData?.site_id) {
    const sites = await getAllSites();
    return sites.find(s => s.id === rpcData.site_id)!;
  }

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

  const sitePropRows = validation.validatedMappings!.map(m => ({
    site_id: siteRow.id,
    property_id: m.propertyId,
    hospitable_widget_id: m.hospitableWidgetId,
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

  return {
    id: siteRow.id,
    partnerId: siteRow.partner_id,
    siteName: siteRow.site_name,
    websiteUrl: siteRow.website_url,
    bookingUrl: siteRow.website_url,
    trackingCode: siteRow.tracking_code,
    hospitableWidgetId: validation.validatedMappings![0].hospitableWidgetId,
    status: "ACTIVE",
    launchDate: siteRow.created_at,
    siteProperties: (propsData || []).map(p => ({
      id: p.id,
      siteId: p.site_id,
      propertyId: p.property_id,
      hospitableWidgetId: p.hospitable_widget_id,
      customBookingUrl: p.custom_booking_url,
      status: "ACTIVE"
    }))
  };
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
    quoteId: r.quote_id ? Number(r.quote_id) : undefined,
    rawOwnerrezData: r.raw_ownerrez_data || undefined,
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
    platform: (r.platform && r.platform !== "ownerrez") ? r.platform : (r.ownerrez_booking_id ? "direct" : (r.platform || undefined)),
    sourceProvider: r.ownerrez_booking_id ? "ownerrez" : (r.payment_confirmation_source?.toLowerCase() === "ownerrez" ? "ownerrez" : "hospitable"),
    paymentConfirmationSource: r.payment_confirmation_source || undefined,
    attributionStatus: r.attribution_status,
    financialDataAvailable: Boolean(r.financial_data_available),
    lastSyncedAt: r.last_synced_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })) as Reservation[];
}

