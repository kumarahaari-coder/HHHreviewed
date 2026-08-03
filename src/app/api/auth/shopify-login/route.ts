import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/supabase/data-store";
import { createClerkClient } from "@clerk/backend";

// Shared secret token configured in both systems
const BRIDGE_TOKEN = process.env.SHOPIFY_HHH_BRIDGE_TOKEN;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Bridge Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || !BRIDGE_TOKEN) {
      console.warn("[Shopify Handoff] Unauthorized access attempt: Missing bridge token.");
      return NextResponse.json({ error: "Unauthorized access: Missing bridge token" }, { status: 401 });
    }
    
    const token = authHeader.substring(7).trim();
    if (token !== BRIDGE_TOKEN.trim()) {
      console.warn("[Shopify Handoff] Unauthorized access attempt: Invalid bridge token.");
      return NextResponse.json({ error: "Unauthorized access: Invalid bridge token" }, { status: 403 });
    }

    // 2. Parse Payload
    const body = await req.json();
    const { shop_domain, customer_id, email } = body;

    if (!shop_domain || !customer_id) {
      return NextResponse.json({ error: "Bad request: Missing shop_domain or customer_id" }, { status: 400 });
    }

    let applicationUserId: string | null = null;
    let dbUser: any = null;

    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();

      // Check if mapping already exists in Supabase
      const { data: mapping, error: mappingErr } = await supabase
        .from("shopify_customer_identities")
        .select("application_user_id")
        .eq("shop_domain", shop_domain)
        .eq("customer_id", customer_id)
        .maybeSingle();

      if (mappingErr) {
        console.error("[Shopify Handoff] Database error fetching mapping:", mappingErr);
        return NextResponse.json({ error: "Database error resolving mapping" }, { status: 500 });
      }

      if (mapping) {
        applicationUserId = mapping.application_user_id;
        
        // Fetch user details
        const { data: user, error: userErr } = await supabase
          .from("users")
          .select("id, email, role, status, clerk_user_id")
          .eq("id", applicationUserId)
          .maybeSingle();

        if (userErr) {
          console.error("[Shopify Handoff] Database error fetching user:", userErr);
          return NextResponse.json({ error: "Database error resolving user" }, { status: 500 });
        }
        dbUser = user;
      } else if (email) {
        // Fallback: match by email address for pre-approved users
        const { data: user, error: userErr } = await supabase
          .from("users")
          .select("id, email, role, status, clerk_user_id")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();

        if (userErr) {
          console.error("[Shopify Handoff] Database error matching user by email:", userErr);
          return NextResponse.json({ error: "Database error during email resolution" }, { status: 500 });
        }

        if (user) {
          dbUser = user;
          applicationUserId = user.id;

          // Create the mapping record automatically in Supabase
          const { error: insertErr } = await supabase
            .from("shopify_customer_identities")
            .insert({
              shop_domain,
              customer_id,
              application_user_id: applicationUserId,
              verified_at: new Date().toISOString(),
              status: "ACTIVE",
            });

          if (insertErr) {
            console.error("[Shopify Handoff] Failed to save identity mapping:", insertErr);
            // Non-blocking, we can still proceed
          } else {
            console.log(`[Shopify Handoff] Auto-created identity mapping for ${email} -> ${customer_id} on ${shop_domain}`);
          }
        }
      }
    } else {
      // Local development mock fallback
      const { db: mockDb } = require("@/lib/db/mockDb");
      
      const matchedUser = mockDb.users.find((u: any) => u.email.toLowerCase().trim() === email?.toLowerCase().trim());
      if (matchedUser) {
        dbUser = {
          id: matchedUser.id,
          email: matchedUser.email,
          role: matchedUser.role,
          status: matchedUser.status,
          clerk_user_id: matchedUser.clerkUserId || "mock_clerk_id_" + matchedUser.id,
        };
      }
    }

    // 3. Strict Authorization Gate
    if (!dbUser) {
      console.warn(`[Shopify Handoff Denied] No user found for customer_id ${customer_id} (${email}) on ${shop_domain}`);
      return NextResponse.json({ error: "Access Denied: No pre-approved application user found" }, { status: 403 });
    }

    if (dbUser.status !== "ACTIVE") {
      console.warn(`[Shopify Handoff Denied] User account status is ${dbUser.status} for ${dbUser.email}`);
      return NextResponse.json({ error: `Access Denied: User account status is ${dbUser.status}` }, { status: 403 });
    }

    const role = dbUser.role;
    if (role !== "CREATOR" && role !== "PARTNER_OWNER") {
      console.warn(`[Shopify Handoff Denied] Role ${role} is not authorized for storefront handoff for ${dbUser.email}`);
      return NextResponse.json({ error: `Access Denied: Role ${role} is not authorized for Shopify storefront access` }, { status: 403 });
    }

    // Get clerkUserId
    const clerkUserId = dbUser.clerk_user_id;
    if (!clerkUserId) {
      console.warn(`[Shopify Handoff Denied] Clerk user ID not mapped for ${dbUser.email}`);
      return NextResponse.json({ error: "Access Denied: User has not completed Clerk sign-up" }, { status: 400 });
    }

    // 4. Generate Clerk Sign-in Token (Ticket)
    if (!CLERK_SECRET_KEY) {
      // Dev simulation fallback
      console.log(`[Shopify Handoff Dev Mode] Generating mock Clerk ticket for ${clerkUserId}`);
      const mockTicketUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/resolve?ticket=mock_ticket_${Math.random().toString(36).substring(2)}`;
      return NextResponse.json({ success: true, redirectUrl: mockTicketUrl });
    }

    const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 60, // short-lived token
    });

    console.log(`[Shopify Handoff] Generated sign-in token for user ${clerkUserId}`);

    return NextResponse.json({
      success: true,
      redirectUrl: signInToken.url
    });

  } catch (error: any) {
    console.error("[Shopify Handoff Error]", error);
    return NextResponse.json({ error: error.message || "Failed to process handoff request" }, { status: 500 });
  }
}
