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
        let partnerId = user.partnerId;

        // Verify production partner existence & active record_status
        if (partnerId && isCommitMode) {
          const { data: partnerRow, error: partnerErr } = await supabase
            .from("partners")
            .select("id, record_status")
            .eq("id", partnerId)
            .maybeSingle();

          if (partnerErr || !partnerRow) {
            throw new Error(`Creator ${user.id} partner ID ${partnerId} not found in production partners table.`);
          }

          if (partnerRow.record_status && !["ACTIVE", "INVITED"].includes(partnerRow.record_status)) {
            throw new Error(`Creator ${user.id} partner ${partnerId} is inactive (status: ${partnerRow.record_status}).`);
          }
        }

        if (isCommitMode) {
          const { data, error } = await supabase.rpc("create_creator_invitation_tx", {
            p_internal_user_id: user.id,
            p_name: user.name,
            p_email: normEmail,
            p_partner_id: partnerId || null,
            p_performed_by_user_id: "user-admin-1",
            p_source: "ADMIN_REPAIR"
          });

          if (error) throw new Error(`Creator invitation failed: ${error.message}`);
          if (!data?.success) throw new Error(`Creator invitation returned unsuccess: ${data?.error}`);
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
