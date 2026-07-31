import { NextResponse } from "next/server";
import { isSupabaseEnabled } from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public Read-Only Readiness Endpoint
 * Used to verify database connectivity and migration version status before cutover.
 * Completely independent of Clerk authentication to prevent circular dependency issues during rollout.
 */
export async function GET() {
  const now = new Date().toISOString();

  try {
    if (!isSupabaseEnabled()) {
      return NextResponse.json({
        ready: true,
        database: "MOCK",
        timestamp: now
      });
    }

    const supabase = createAdminClient();
    
    // Attempt a basic read-only query to schema_migrations
    const { data, error } = await supabase
      .from("schema_migrations")
      .select("version, applied_at")
      .eq("version", "20260731_hhh_final_production_migration")
      .maybeSingle();

    if (error) {
      console.error("[Readiness Error] Database query failed:", error);
      return NextResponse.json({
        ready: false,
        database: "FAILED",
        error: error.message,
        timestamp: now
      }, { status: 503 });
    }

    if (!data) {
      console.warn("[Readiness Warning] Migration version 20260731_hhh_final_production_migration is missing.");
      return NextResponse.json({
        ready: false,
        database: "CONNECTED_MIGRATION_MISSING",
        error: "Migration version is not applied.",
        timestamp: now
      }, { status: 503 });
    }

    return NextResponse.json({
      ready: true,
      database: "CONNECTED",
      migration: data.version,
      appliedAt: data.applied_at,
      timestamp: now
    });

  } catch (error: any) {
    console.error("[Readiness Exception] Failed to evaluate readiness:", error);
    return NextResponse.json({
      ready: false,
      database: "EXCEPTION",
      error: error?.message || "Internal error",
      timestamp: now
    }, { status: 500 });
  }
}
