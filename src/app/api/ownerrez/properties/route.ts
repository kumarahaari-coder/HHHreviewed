import { getOwnerRezProperties, OwnerRezApiError, OwnerRezConfigurationError } from "@/lib/ownerrez/client";
import { matchOwnerRezProperty, getCorePropertiesMappingSummary } from "@/lib/ownerrez/properties";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = (await getOwnerRezProperties()) as { items?: any[]; count?: number } | any[];
    
    // Enrich with HHH property mappings
    if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.items)) {
      const enrichedItems = data.items.map((item: any) => {
        const mapping = matchOwnerRezProperty(item);
        return {
          ...item,
          hhh_property: mapping.hhhProperty,
          hhh_match_reason: mapping.matchReason,
        };
      });
      return Response.json(
        {
          ...data,
          items: enrichedItems,
          core_properties_mapping: getCorePropertiesMappingSummary(),
        },
        { status: 200 }
      );
    }

    return Response.json(data, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OwnerRezConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }
    if (error instanceof OwnerRezApiError) {
      return Response.json(
        {
          error: error.message,
          status: error.status,
          details: error.responseBody,
        },
        { status: error.status }
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
