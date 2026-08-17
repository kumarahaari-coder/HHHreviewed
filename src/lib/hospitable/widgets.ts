import { HHH_PUBLIC_PROPERTIES } from "@/lib/data/hhhProperties";

export interface WidgetValidationResult {
  valid: boolean;
  widgetId: string;
  customBookingUrl: string;
  propertyId: string;
  propertyName: string;
  hospitablePropertyId: string;
  error?: string;
}

export interface ValidatedPropertyMapping {
  propertyId: string;
  hospitableWidgetId: string;
  customBookingUrl: string;
}

const RESERVED_PLACEHOLDERS = new Set([
  "widget_1",
  "widget_2",
  "widget_3",
  "widget_4",
  "test",
  "dummy",
  "placeholder",
  "xxx",
  "none",
  "null",
  "undefined",
  "fake"
]);

/**
 * Validates a Hospitable Widget URL against a target property UUID.
 * Required Format: https://booking.hospitable.com/widget/{widget_uuid}/{listing_id}
 */
export function validateWidgetId(widgetUrlInput: string, propertyId: string): WidgetValidationResult {
  const cleanInput = (widgetUrlInput || "").trim();

  // Find target property
  const prop = HHH_PUBLIC_PROPERTIES.find(
    p => p.id === propertyId || (p as any).hospitablePropertyId === propertyId
  );

  const propertyName = prop?.name || "Target Property";
  const hospId = (prop as any)?.hospitablePropertyId || "";

  if (!cleanInput) {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Widget URL for "${propertyName}" cannot be empty.`
    };
  }

  if (RESERVED_PLACEHOLDERS.has(cleanInput.toLowerCase())) {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `"${cleanInput}" is a placeholder value. Full Hospitable Widget URL required for "${propertyName}".`
    };
  }

  // Require full URL beginning with http:// or https://
  if (!cleanInput.startsWith("http://") && !cleanInput.startsWith("https://")) {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `"${propertyName}" requires a full Hospitable Widget URL in format: https://booking.hospitable.com/widget/{widget_uuid}/{listing_id}`
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanInput);
  } catch {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Invalid URL format for "${propertyName}". Expected: https://booking.hospitable.com/widget/{widget_uuid}/{listing_id}`
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Protocol must be https:// for "${propertyName}" widget URL.`
    };
  }

  if (parsedUrl.hostname !== "booking.hospitable.com") {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Hostname must be exactly "booking.hospitable.com" for "${propertyName}" (received: ${parsedUrl.hostname}).`
    };
  }

  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathParts.length < 3 || pathParts[0] !== "widget") {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `URL path must begin with "/widget/{widget_uuid}/{listing_id}" for "${propertyName}".`
    };
  }

  const widgetUuid = pathParts[1].toLowerCase().trim();
  const listingId = pathParts[2].trim();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(widgetUuid)) {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Invalid widget UUID "${widgetUuid}" in widget URL for "${propertyName}".`
    };
  }

  const numericRegex = /^[0-9]+$/;
  if (!numericRegex.test(listingId)) {
    return {
      valid: false,
      widgetId: "",
      customBookingUrl: "",
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Invalid numeric listing ID "${listingId}" in widget URL for "${propertyName}".`
    };
  }

  const canonicalUrl = `https://booking.hospitable.com/widget/${widgetUuid}/${listingId}`;

  return {
    valid: true,
    widgetId: widgetUuid,
    customBookingUrl: canonicalUrl,
    propertyId,
    propertyName,
    hospitablePropertyId: hospId
  };
}

/**
 * Validates a set of 4 widget mappings for a referral site registration.
 */
export function validateFourPropertyWidgetMappings(
  mappings: { propertyId: string; hospitableWidgetId: string }[]
): {
  valid: boolean;
  errors: string[];
  validatedMappings?: ValidatedPropertyMapping[];
} {
  const errors: string[] = [];

  if (!mappings || mappings.length !== 4) {
    return {
      valid: false,
      errors: ["Website registration requires exactly 4 valid property widget mappings."]
    };
  }

  const corePropertyIds = [
    "38d9159e-a35d-405e-826e-7381ad3c3197", // Uptown St. Augustine
    "f0fb867d-47cd-47d4-afa6-c4bf226c1768", // Downtown St. Augustine (Lincoln)
    "51be6158-268d-4c96-8f0b-9968f544ddfa", // Ellsworth, Maine
    "55791a54-b1a3-459e-bbd5-9073a418b774"  // Beech Mountain, NC
  ];

  const seenProperties = new Set<string>();
  const seenWidgets = new Set<string>();
  const validatedMappings: ValidatedPropertyMapping[] = [];

  for (const m of mappings) {
    const cleanWidget = (m.hospitableWidgetId || "").trim();
    const result = validateWidgetId(cleanWidget, m.propertyId);

    if (!result.valid) {
      errors.push(result.error || `Invalid widget URL for property ${m.propertyId}`);
    }

    if (seenProperties.has(m.propertyId)) {
      errors.push(`Duplicate property mapping submitted for ${result.propertyName}.`);
    }
    seenProperties.add(m.propertyId);

    if (result.widgetId) {
      if (seenWidgets.has(result.widgetId)) {
        errors.push(`Duplicate widget UUID "${result.widgetId}" submitted. Each property must have a unique widget.`);
      }
      seenWidgets.add(result.widgetId);
    }

    if (result.valid) {
      validatedMappings.push({
        propertyId: m.propertyId,
        hospitableWidgetId: result.widgetId,
        customBookingUrl: result.customBookingUrl
      });
    }
  }

  // Ensure all 4 core properties are present
  for (const coreId of corePropertyIds) {
    if (!seenProperties.has(coreId)) {
      errors.push(`Missing required property mapping for property UUID ${coreId}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedMappings: errors.length === 0 ? validatedMappings : undefined
  };
}

export const validateWidgetUrl = validateWidgetId;
