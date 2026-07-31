import {
  buildCollectionPath,
  fetchHospitableCollection,
  HospitableApiError,
  HospitableConfigurationError,
} from "@/lib/hospitable/client";

import { normalizeHospitableProperty } from "@/lib/hospitable/normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const propertyPage = await fetchHospitableCollection(
      buildCollectionPath("properties", "page=1&per_page=100")
    );

    const properties = propertyPage.data.map(
      normalizeHospitableProperty
    );

    return Response.json({
      success: true,
      syncedAt: new Date().toISOString(),
      source: "Hospitable Public API v2",
      summary: {
        propertyCount: properties.length,
      },
      properties,
    });
  } catch (error) {
    if (error instanceof HospitableConfigurationError) {
      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 503 }
      );
    }

    if (error instanceof HospitableApiError) {
      return Response.json(
        {
          success: false,
          error: error.message,
          status: error.status,
          details: error.responseBody,
        },
        { status: error.status }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown Hospitable property sync error";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
