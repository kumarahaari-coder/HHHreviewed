import type {
  PaymentStatus,
  Property,
  Reservation,
  ReservationStatus,
} from "@/lib/db/schema";

import { HHH_PUBLIC_PROPERTIES } from "@/lib/data/hhhProperties";

type JsonRecord = Record<string, unknown>;

const HOSPITABLE_PROPERTY_OVERRIDES: Record<
  string,
  Partial<Property>
> = {
  "058aed01-470f-4ca7-a191-37c597e7f377": {
    name: "Uptown St. Augustine",
    location: "St. Augustine, Florida",
  },
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;

  for (const key of path) {
    current = asRecord(current)[key];
  }

  return current;
}

function firstValue(...values: unknown[]): unknown {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const parsed =
      typeof value === "number"
        ? value
        : Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function stringValue(...values: unknown[]): string {
  const value = firstValue(...values);

  return value === undefined
    ? ""
    : String(value);
}

/**
 * Hospitable financial amounts are returned as integer cents.
 *
 * Example:
 * 266680 = $2,666.80
 */
function moneyAmount(value: unknown): number {
  const record = asRecord(value);
  const amount = numberValue(record.amount, value);

  return amount / 100;
}

function sumMoneyItems(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce((total, item) => {
    return total + moneyAmount(item);
  }, 0);
}

function findMoneyItem(
  value: unknown,
  matcher: (item: JsonRecord) => boolean
): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  const item = value
    .map(asRecord)
    .find(matcher);

  return item
    ? moneyAmount(item)
    : 0;
}

function includesText(value: unknown, search: string): boolean {
  return String(value || "")
    .toLowerCase()
    .includes(search.toLowerCase());
}

function normalizeStatus(rawStatus: unknown): ReservationStatus {
  const value = String(rawStatus || "").toLowerCase();

  if (
    ["cancelled", "canceled", "declined"].includes(value)
  ) {
    return "CANCELLED";
  }

  if (
    ["checked_in", "checked-in", "in_house", "in-house"].includes(value)
  ) {
    return "CHECKED_IN";
  }

  if (
    ["checked_out", "checked-out"].includes(value)
  ) {
    return "CHECKED_OUT";
  }

  if (
    ["completed", "past"].includes(value)
  ) {
    return "COMPLETED";
  }

  if (
    ["accepted", "confirmed", "booked"].includes(value)
  ) {
    return "CONFIRMED";
  }

  if (
    ["pending", "request", "inquiry"].includes(value)
  ) {
    return "PENDING";
  }

  return "UNKNOWN";
}

function normalizePaymentStatus(
  raw: JsonRecord,
  bookingAmount: number,
  amountReceived: number,
  refundAmount: number
): PaymentStatus {
  const value = stringValue(
    raw.payment_status,
    getPath(raw, ["financials", "payment_status"]),
    getPath(raw, ["financial", "payment_status"]),
    getPath(raw, ["payment", "status"])
  ).toLowerCase();

  if (
    value.includes("disput") ||
    value.includes("chargeback")
  ) {
    return "DISPUTED";
  }

  if (
    value.includes("partial") &&
    value.includes("refund")
  ) {
    return "PARTIALLY_REFUNDED";
  }

  if (
    value.includes("refund") ||
    value === "refunded"
  ) {
    return "REFUNDED";
  }

  if (
    ["paid", "succeeded", "complete", "completed", "collected"].includes(value)
  ) {
    return "PAID";
  }

  if (
    ["partial", "partially_paid"].includes(value)
  ) {
    return "PARTIAL";
  }

  if (
    ["unpaid", "failed", "outstanding"].includes(value)
  ) {
    return "UNPAID";
  }

  if (
    refundAmount > 0 &&
    amountReceived > 0
  ) {
    return "PARTIALLY_REFUNDED";
  }

  if (
    bookingAmount > 0 &&
    amountReceived >= bookingAmount
  ) {
    return "PAID";
  }

  if (
    bookingAmount > 0 &&
    amountReceived > 0 &&
    amountReceived < bookingAmount
  ) {
    return "PARTIAL";
  }

  return "UNKNOWN";
}

function getPropertyId(raw: JsonRecord): string {
  const relationship =
    getPath(raw, ["relationships", "properties", "data"]) ??
    getPath(raw, ["relationships", "property", "data"]);

  const relationId = Array.isArray(relationship)
    ? asRecord(relationship[0]).id
    : asRecord(relationship).id;

  const properties = raw.properties;

  const embedded = Array.isArray(properties)
    ? asRecord(properties[0])
    : asRecord(raw.property);

  return (
    stringValue(
      raw.property_id,
      raw.propertyId,
      embedded.id,
      relationId,
      getPath(raw, ["listing", "property_id"])
    ) || "unknown-property"
  );
}

function matchPublicProperty(
  name: string,
  location: string
): Property | undefined {
  const needle = `${name} ${location}`.toLowerCase();

  return HHH_PUBLIC_PROPERTIES.find((item) => {
    const labels =
      `${item.name} ${item.location}`.toLowerCase();

    return (
      (needle.includes("uptown") &&
        labels.includes("uptown")) ||
      (needle.includes("downtown") &&
        labels.includes("downtown")) ||
      (needle.includes("ellsworth") &&
        labels.includes("ellsworth")) ||
      (needle.includes("beech") &&
        labels.includes("beech"))
    );
  });
}

export function normalizeHospitableProperty(
  input: unknown
): Property {
  const raw = asRecord(input);
  const attributes = asRecord(raw.attributes);

  const address = asRecord(
    firstValue(raw.address, attributes.address)
  );

  const hospitableId =
    stringValue(raw.id, attributes.id) ||
    crypto.randomUUID();

  const name =
    stringValue(
      raw.name,
      attributes.name,
      raw.nickname,
      attributes.nickname
    ) || "Unnamed Hospitable Property";

  const city = firstValue(
    raw.city,
    attributes.city,
    address.city,
    address.locality
  );

  const state = firstValue(
    raw.state,
    attributes.state,
    address.state,
    address.region
  );

  const country = firstValue(
    raw.country,
    attributes.country,
    address.country
  );

  const location =
    [city, state].filter(Boolean).join(", ") ||
    stringValue(
      address.formatted,
      address.display,
      raw.location,
      country
    ) ||
    "Location not supplied";

  const propertyOverride =
    HOSPITABLE_PROPERTY_OVERRIDES[hospitableId];

  const known = matchPublicProperty(
    propertyOverride?.name || name,
    propertyOverride?.location || location
  );

  const photos = firstValue(
    raw.photos,
    attributes.photos
  );

  const firstPhoto = Array.isArray(photos)
    ? asRecord(photos[0])
    : {};

  return {
    id: `hosp-${hospitableId}`,
    hospitablePropertyId: hospitableId,
    name:
      propertyOverride?.name ||
      known?.name ||
      name,
    location:
      propertyOverride?.location ||
      known?.location ||
      location,
    timezone:
      propertyOverride?.timezone ||
      stringValue(
        raw.timezone,
        attributes.timezone,
        address.timezone,
        known?.timezone
      ) ||
      "America/New_York",
    imageUrl:
      propertyOverride?.imageUrl ||
      stringValue(
        raw.image_url,
        attributes.image_url,
        raw.picture,
        attributes.picture,
        firstPhoto.url,
        firstPhoto.large_url,
        known?.imageUrl
      ),
    websiteUrl:
      propertyOverride?.websiteUrl ||
      known?.websiteUrl,
    bookingUrl:
      propertyOverride?.bookingUrl ||
      known?.bookingUrl,
    summary:
      propertyOverride?.summary ||
      known?.summary,
    mood:
      propertyOverride?.mood ||
      known?.mood,
    minimumAge:
      propertyOverride?.minimumAge ??
      known?.minimumAge,
    maximumOccupancy:
      propertyOverride?.maximumOccupancy ??
      (numberValue(
        getPath(raw, ["capacity", "max"]),
        getPath(attributes, ["capacity", "max"]),
        raw.max_guests,
        known?.maximumOccupancy
      ) || known?.maximumOccupancy),
    sourceUrl:
      propertyOverride?.sourceUrl ||
      known?.sourceUrl,
    sourceVerifiedAt:
      propertyOverride?.sourceVerifiedAt ||
      known?.sourceVerifiedAt,
    syncStatus: "HOSPITABLE_SYNCED",
    status: stringValue(
      raw.status,
      attributes.status
    )
      .toLowerCase()
      .includes("inactive")
      ? "INACTIVE"
      : "ACTIVE",
  };
}

export function normalizeHospitableReservation(
  input: unknown
): Reservation {
  const raw = asRecord(input);
  const attributes = asRecord(raw.attributes);

  const source: JsonRecord = {
    ...attributes,
    ...raw,
  };

  const hospitableId =
    stringValue(
      raw.id,
      attributes.id,
      source.reservation_id
    ) || crypto.randomUUID();

  const propertyId =
    getPropertyId(source);

  const checkInDate = stringValue(
    source.arrival_date,
    source.check_in,
    source.check_in_date,
    source.start_date
  );

  const checkOutDate = stringValue(
    source.departure_date,
    source.check_out,
    source.check_out_date,
    source.end_date
  );

  const bookingDate =
    stringValue(
      source.created_at,
      source.booking_date,
      source.booked_at,
      source.accepted_at
    ) || new Date().toISOString();

  const financials =
    asRecord(source.financials);

  const guestFinancials =
    asRecord(financials.guest);

  const hostFinancials =
    asRecord(financials.host);

  const guestFees =
    guestFinancials.fees;

  const guestTaxes =
    guestFinancials.taxes;

  const guestPayments =
    guestFinancials.payments;

  const hostFees =
    hostFinancials.host_fees;

  const bookingAmount =
    moneyAmount(
      guestFinancials.total_price
    ) ||
    moneyAmount(
      guestFinancials.accommodation
    ) ||
    numberValue(
      source.booking_amount,
      source.total_price,
      source.guest_total
    );

  const amountReceived =
    sumMoneyItems(guestPayments) ||
    numberValue(
      source.amount_received,
      getPath(source, [
        "financials",
        "amount_received",
      ]),
      getPath(source, [
        "payment",
        "amount_received",
      ])
    );

  const refundAmount =
    numberValue(
      source.refund_amount,
      getPath(source, [
        "financials",
        "refund_amount",
      ]),
      getPath(source, [
        "payment",
        "refund_amount",
      ])
    );

  const taxesAmount =
    sumMoneyItems(guestTaxes) ||
    numberValue(
      source.taxes_amount
    );

  const cleaningFee =
    findMoneyItem(
      guestFees,
      (item) =>
        includesText(
          item.label,
          "cleaning"
        ) ||
        includesText(
          item.category,
          "cleaning"
        )
    ) ||
    findMoneyItem(
      hostFinancials.guest_fees,
      (item) =>
        includesText(
          item.label,
          "cleaning"
        ) ||
        includesText(
          item.category,
          "cleaning"
        )
    ) ||
    numberValue(
      source.cleaning_fee
    );

  const guestServiceFee =
    findMoneyItem(
      guestFees,
      (item) =>
        includesText(
          item.label,
          "service"
        ) ||
        includesText(
          item.category,
          "service"
        )
    );

  const hostServiceFee =
    Math.abs(
      sumMoneyItems(hostFees)
    );

  const serviceFee =
    guestServiceFee ||
    hostServiceFee ||
    numberValue(
      source.service_fee
    );

  const financialDataAvailable =
    Object.keys(financials).length > 0 &&
    (
      bookingAmount !== 0 ||
      amountReceived !== 0 ||
      taxesAmount !== 0 ||
      cleaningFee !== 0 ||
      serviceFee !== 0 ||
      moneyAmount(hostFinancials.revenue) !== 0
    );

  const paymentStatus =
    normalizePaymentStatus(
      source,
      bookingAmount,
      amountReceived,
      refundAmount
    );

  let nights = numberValue(
    source.nights,
    source.nights_count
  );

  if (
    !nights &&
    checkInDate &&
    checkOutDate
  ) {
    nights = Math.max(
      0,
      Math.round(
        (
          new Date(checkOutDate).getTime() -
          new Date(checkInDate).getTime()
        ) / 86400000
      )
    );
  }

  const reservationStatusValue =
    firstValue(
      getPath(source, [
        "reservation_status",
        "current",
        "category",
      ]),
      source.status
    );

  return {
    id: `hosp-res-${hospitableId}`,
    hospitableReservationId: hospitableId,
    confirmationCode:
      stringValue(
        source.code,
        source.confirmation_code,
        source.reservation_code,
        source.platform_id
      ) || hospitableId,
    propertyId: `hosp-${propertyId}`,
    bookingDate,
    checkInDate,
    checkOutDate,
    nights,
    guests: numberValue(
      getPath(source, ["guests", "total"]),
      source.guest_count,
      source.number_of_guests
    ),
    reservationStatus:
      normalizeStatus(
        reservationStatusValue
      ),
    paymentStatus,
    bookingAmount,
    amountReceived,
    refundAmount,
    taxesAmount,
    cleaningFee,
    serviceFee,
    currency:
      stringValue(
        financials.currency,
        guestFinancials.currency,
        source.currency,
        getPath(source, [
          "money",
          "currency",
        ])
      ) || "USD",
    attributionStatus: "UNATTRIBUTED",
    payoutStatus: "ESTIMATED",
    originalData: JSON.stringify(raw),
    lastSyncedAt:
      new Date().toISOString(),
    attributionSource:
      "Hospitable source identifier not yet mapped",
    platform:
      stringValue(
        source.platform,
        source.channel,
        source.source
      ) || "unknown",
    paymentConfirmationSource:
      financialDataAvailable
        ? "HOSPITABLE"
        : "NOT_AVAILABLE",
    financialDataAvailable,
  };
}