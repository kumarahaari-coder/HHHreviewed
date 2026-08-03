/**
 * Standalone Offline User Reconciliation Utility
 * NOT imported by application runtime.
 * Run manually via `npx tsx scripts/reconcile-existing-users.ts [--commit]`
 */

import { createClient } from "@supabase/supabase-js";
import { db as mockDb } from "../src/lib/db/mockDb";

interface ReconciliationReportItem {
  mockUserId: string;
  name: string;
  email: string;
  role: string;
  resolvedPartnerId?: string;
  status: string;
  clerkUserId?: string;
  persistentAction: "SEEDED_ADMIN" | "PROVISIONED_CREATOR" | "SKIPPED_EXISTS" | "FAILED";
  error?: string;
}

function toUuid(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id === "partner-001") return "00000000-0000-0000-0000-000000000001";
  if (id === "partner-002") return "00000000-0000-0000-0000-000000000002";
  if (id === "partner-003") return "00000000-0000-0000-0000-000000000003";
  if (id === "partner-hema") return "00000000-0000-0000-0000-00000000000a";
  return id;
}

async function runReconciliation() {
  const isCommitMode = process.argv.includes("--commit");
  console.log(`=== RUNNING OFFLINE MOCK USER RECONCILIATION (${isCommitMode ? "COMMIT MODE" : "DRY-RUN MODE"}) ===`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const report: ReconciliationReportItem[] = [];

  // 1. Seed Production Partners from mockDb.partners if in commit mode
  if (isCommitMode) {
    console.log("Seeding base production partners into public.partners table...");
    for (const p of mockDb.partners) {
      const pUuid = toUuid(p.id)!;
      const partnerCode = p.id.toUpperCase().replace(/-/g, "_");
      const { error: pErr } = await supabase.from("partners").upsert({
        id: pUuid,
        partner_code: partnerCode,
        business_name: p.businessName,
        contact_name: p.contactName,
        contact_email: p.email,
        phone: p.phone || null,
        status: "active"
      }, { onConflict: "id" });

      if (pErr) {
        console.error(`Failed to seed partner ${p.id} (${pUuid}):`, pErr.message);
        throw new Error(`Partner seed failed for ${p.id}: ${pErr.message}`);
      }
    }
    console.log("✓ Production partners seeded successfully.");
  }

  for (const user of mockDb.users) {
    const normEmail = user.email.trim().toLowerCase();

    try {
      if (user.role === "SUPER_ADMIN") {
        if (!user.clerkUserId) {
          throw new Error(`Super Admin ${user.id} has no verified Clerk User ID`);
        }

        if (isCommitMode) {
          const { data, error } = await supabase.rpc("seed_super_admin_guarded", {
            p_user_id: user.id,
            p_name: user.name,
            p_email: normEmail,
            p_clerk_user_id: user.clerkUserId
          });

          if (error) throw new Error(`Super Admin seed failed: ${error.message}`);
          if (!data?.success) throw new Error(`Super Admin seed returned unsuccess: ${data?.error}`);
        }

        report.push({
          mockUserId: user.id,
          name: user.name,
          email: normEmail,
          role: user.role,
          status: user.status,
          clerkUserId: user.clerkUserId,
          persistentAction: "SEEDED_ADMIN"
        });

      } else {
        const isAdmin = user.role === "FINANCE_ADMIN" || user.role === "ADMIN";
        let rawPartnerId = isAdmin ? undefined : user.partnerId;
        let partnerId = toUuid(rawPartnerId);

        // Verify production partner existence & active status for tenant-bound roles
        if (partnerId && isCommitMode) {
          const { data: partnerRow, error: partnerErr } = await supabase
            .from("partners")
            .select("id, status")
            .eq("id", partnerId)
            .maybeSingle();

          if (partnerErr || !partnerRow) {
            throw new Error(`User ${user.id} partner ID ${partnerId} not found in production partners table.`);
          }

          if (partnerRow.status && !["active", "invited", "ACTIVE", "INVITED"].includes(partnerRow.status)) {
            throw new Error(`User ${user.id} partner ${partnerId} is inactive (status: ${partnerRow.status}).`);
          }
        }

        if (isCommitMode) {
          const { data, error } = await supabase.rpc("create_creator_invitation_tx", {
            p_internal_user_id: user.id,
            p_name: user.name,
            p_email: normEmail,
            p_partner_id: partnerId || null,
            p_performed_by_user_id: "user-admin-1",
            p_source: "ADMIN_REPAIR",
            p_role: user.role
          });

          if (error) throw new Error(`User invitation failed for ${user.id}: ${error.message}`);
          if (!data?.success) throw new Error(`User invitation returned unsuccess for ${user.id}: ${data?.error}`);

          // If clerkUserId is populated on mock user, map it via map_clerk_user_tx
          if (user.clerkUserId) {
            const { error: mapErr } = await supabase.rpc("map_clerk_user_tx", {
              p_internal_user_id: user.id,
              p_email: normEmail,
              p_exact_clerk_user_id: user.clerkUserId,
              p_operation: "MAP",
              p_performed_by_user_id: "user-admin-1",
              p_source: "ADMIN_REPAIR"
            });
            if (mapErr) {
              console.warn(`Warning mapping clerkUserId for ${user.id}:`, mapErr.message);
            }
          }
        }

        report.push({
          mockUserId: user.id,
          name: user.name,
          email: normEmail,
          role: user.role,
          resolvedPartnerId: partnerId,
          status: user.status,
          clerkUserId: user.clerkUserId,
          persistentAction: "PROVISIONED_CREATOR"
        });
      }

    } catch (err: any) {
      report.push({
        mockUserId: user.id,
        name: user.name,
        email: normEmail,
        role: user.role,
        status: user.status,
        persistentAction: "FAILED",
        error: err?.message
      });
    }
  }

  console.log("\n=== RECONCILIATION SUMMARY REPORT ===");
  console.table(report);

  const hasFailures = report.some(r => r.persistentAction === "FAILED");
  if (hasFailures) {
    console.error("\nFATAL: One or more user reconciliations failed. Review table above.");
    process.exit(1);
  }

  console.log(`\nReconciliation completed cleanly. Total Users Processed: ${report.length}. Mode: ${isCommitMode ? "COMMITTED TO SUPABASE" : "DRY-RUN ONLY"}`);
}

runReconciliation();
