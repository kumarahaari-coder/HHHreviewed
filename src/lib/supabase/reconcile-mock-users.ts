import { db as mockDb } from "@/lib/db/mockDb";
import { createCreatorInvitation, isSupabaseEnabled } from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ReconciliationItem {
  mockUserId: string;
  name: string;
  email: string;
  role: string;
  partnerId?: string;
  status: string;
  action: "SEEDED_ADMIN" | "PROVISIONED_CREATOR" | "SKIPPED_EXISTING" | "FAILED";
  error?: string;
}

export async function reconcileAllMockUsers(): Promise<{
  timestamp: string;
  totalMockUsers: number;
  results: ReconciliationItem[];
}> {
  const now = new Date().toISOString();
  const results: ReconciliationItem[] = [];

  if (!isSupabaseEnabled()) {
    return {
      timestamp: now,
      totalMockUsers: mockDb.users.length,
      results: mockDb.users.map(u => ({
        mockUserId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        partnerId: u.partnerId,
        status: u.status,
        action: "SKIPPED_EXISTING"
      }))
    };
  }

  const supabase = createAdminClient();

  for (const user of mockDb.users) {
    try {
      if (user.role === "SUPER_ADMIN") {
        const { data, error } = await supabase.rpc("seed_super_admin_guarded", {
          p_user_id: user.id,
          p_name: user.name,
          p_email: user.email.toLowerCase().trim(),
          p_clerk_user_id: user.clerkUserId || "user_3HGIul5Zwc031uj94utBUUSLE7s"
        });

        if (error) throw new Error(error.message);

        results.push({
          mockUserId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          action: "SEEDED_ADMIN"
        });
      } else {
        const invitedUser = await createCreatorInvitation({
          internalUserId: user.id,
          name: user.name,
          email: user.email,
          partnerId: user.partnerId,
          performedByUserId: "user-admin-1",
          source: "ADMIN_REPAIR"
        });

        results.push({
          mockUserId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          partnerId: invitedUser.partnerId,
          status: invitedUser.status,
          action: "PROVISIONED_CREATOR"
        });
      }
    } catch (err: any) {
      results.push({
        mockUserId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        partnerId: user.partnerId,
        status: user.status,
        action: "FAILED",
        error: err?.message
      });
    }
  }

  return {
    timestamp: now,
    totalMockUsers: mockDb.users.length,
    results
  };
}
