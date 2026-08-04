import { HHH_PUBLIC_PROPERTIES } from "@/lib/data/hhhProperties";

export interface WidgetValidationResult {
  valid: boolean;
  widgetId: string;
  propertyId: string;
  propertyName: string;
  hospitablePropertyId: string;
  error?: string;
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
 * Validates a Hospitable Widget ID against a target property UUID.
 */
export function validateWidgetId(widgetId: string, propertyId: string): WidgetValidationResult {
  const cleanWidgetId = (widgetId || "").trim();

  // Find target property
  const prop = HHH_PUBLIC_PROPERTIES.find(
    p => p.id === propertyId || (p as any).hospitablePropertyId === propertyId
  );

  const propertyName = prop?.name || "Unknown Property";
  const hospId = (prop as any)?.hospitablePropertyId || "";

  if (!cleanWidgetId) {
    return {
      valid: false,
      widgetId: cleanWidgetId,
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Widget ID for ${propertyName} cannot be empty.`
    };
  }

  if (RESERVED_PLACEHOLDERS.has(cleanWidgetId.toLowerCase())) {
    return {
      valid: false,
      widgetId: cleanWidgetId,
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `"${cleanWidgetId}" is a placeholder value. Real production widget ID required for ${propertyName}.`
    };
  }

  if (cleanWidgetId.length < 3) {
    return {
      valid: false,
      widgetId: cleanWidgetId,
      propertyId,
      propertyName,
      hospitablePropertyId: hospId,
      error: `Widget ID "${cleanWidgetId}" for ${propertyName} is too short.`
    };
  }

  return {
    valid: true,
    widgetId: cleanWidgetId,
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
): { valid: boolean; errors: string[]; validatedMappings?: { propertyId: string; hospitableWidgetId: string }[] } {
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
  const validatedMappings: { propertyId: string; hospitableWidgetId: string }[] = [];

  for (const m of mappings) {
    const cleanWidget = (m.hospitableWidgetId || "").trim();
    const result = validateWidgetId(cleanWidget, m.propertyId);

    if (!result.valid) {
      errors.push(result.error || `Invalid widget ID for property ${m.propertyId}`);
    }

    if (seenProperties.has(m.propertyId)) {
      errors.push(`Duplicate property mapping submitted for ${result.propertyName}.`);
    }
    seenProperties.add(m.propertyId);

    if (cleanWidget) {
      if (seenWidgets.has(cleanWidget)) {
        errors.push(`Duplicate widget ID "${cleanWidget}" submitted. Each property must have a unique widget ID.`);
      }
      seenWidgets.add(cleanWidget);
    }

    validatedMappings.push({
      propertyId: m.propertyId,
      hospitableWidgetId: cleanWidget
    });
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
