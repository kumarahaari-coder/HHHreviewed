import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("properties")
      .select("id, property_name")
      .limit(5);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      routeVersion: "HHH-SUPABASE-TEST-V2",
      connected: true,
      properties: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        routeVersion: "HHH-SUPABASE-TEST-V2",
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Supabase error",
      },
      { status: 500 }
    );
  }
}
