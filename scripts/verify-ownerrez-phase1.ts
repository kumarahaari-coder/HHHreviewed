/**
 * OwnerRez Phase 1 Read-Only Verification Script
 * 
 * Verifies:
 * A. OwnerRez health result (HTTP status, latency, credential validity)
 * B. Exact live property result & matching against HHH 4 core properties
 * C. Exact live booking result & identifying source fields
 * D. Source stability (stable ID vs display name)
 * E. Attribution feasibility (OwnerRez booking source -> HHH site -> partner)
 */

import fs from "fs";
import path from "path";

// 1. Manually parse .env.local to ensure environment variables are available
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match && !match[1].startsWith("#")) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import {
  isOwnerRezConfigured,
  getOwnerRezConfig,
  checkOwnerRezHealth,
  getOwnerRezProperties,
  getOwnerRezBookings,
  getOwnerRezBooking,
} from "../src/lib/ownerrez/client";

const HHH_CORE_PROPERTIES = [
  {
    id: "38d9159e-a35d-405e-826e-7381ad3c3197",
    name: "Uptown St. Augustine",
    city: "St. Augustine",
    state: "FL",
    hospitableId: "058aed01-470f-4ca7-a191-37c597e7f377",
  },
  {
    id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768",
    name: "Downtown St. Augustine (Lincoln)",
    city: "St. Augustine",
    state: "FL",
    hospitableId: "5da25edc-88ac-43c4-876a-f7b626c88ecd",
  },
  {
    id: "51be6158-268d-4c96-8f0b-9968f544ddfa",
    name: "Ellsworth, Maine",
    city: "Ellsworth",
    state: "ME",
    hospitableId: "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0",
  },
  {
    id: "55791a54-b1a3-459e-bbd5-9073a418b774",
    name: "Beech Mountain, North Carolina",
    city: "Beech Mountain",
    state: "NC",
    hospitableId: "e5552f35-6f5a-4afc-afd1-d0a676e98dc4",
  },
];

async function runVerification() {
  console.log("===============================================================");
  console.log("OWNERREZ PHASE 1 READ-ONLY LIVE VERIFICATION TARGETS");
  console.log("===============================================================\n");

  if (!isOwnerRezConfigured()) {
    console.error("❌ OWNERREZ_EMAIL or OWNERREZ_PAT is not set in .env.local!");
    console.error("Please add your OWNERREZ_EMAIL and OWNERREZ_PAT to .env.local.");
    process.exit(1);
  }

  const config = getOwnerRezConfig();
  console.log("Configuration detected:");
  console.log(`- API Base: ${config.apiBase}`);
  console.log(`- Account Email: ${config.email}`);
  console.log(`- PAT configured: Yes (${config.pat.length} chars)`);
  console.log(`- User-Agent: ${config.userAgent}\n`);

  // Target A: Health Check
  console.log("---------------------------------------------------------------");
  console.log("TARGET A: HEALTH CHECK & CREDENTIAL VALIDATION");
  console.log("---------------------------------------------------------------");
  const health = await checkOwnerRezHealth();
  console.log("Health status:", health.status);
  console.log("HTTP Status Code:", health.statusCode);
  console.log("Latency (ms):", health.latencyMs);
  if (health.error) {
    console.error("Health error:", health.error);
  }
  console.log("Credentials valid:", health.status === "healthy" ? "YES" : "NO");

  if (health.status !== "healthy") {
    console.error("\n❌ Aborting further checks because health verification failed.");
    process.exit(1);
  }

  // Target B: Properties
  console.log("\n---------------------------------------------------------------");
  console.log("TARGET B: LIVE OWNERREZ PROPERTY INSPECTION & MAPPING");
  console.log("---------------------------------------------------------------");
  const propsResponse = await getOwnerRezProperties();
  console.log("Raw properties payload:\n", JSON.stringify(propsResponse, null, 2));

  // Extract items
  let propertiesList: any[] = [];
  if (Array.isArray(propsResponse)) {
    propertiesList = propsResponse;
  } else if (propsResponse && typeof propsResponse === "object" && Array.isArray((propsResponse as any).items)) {
    propertiesList = (propsResponse as any).items;
  }

  console.log(`\nFound ${propertiesList.length} property/properties in OwnerRez.`);
  for (const p of propertiesList) {
    console.log(`- OwnerRez Property ID: ${p.id}`);
    console.log(`  Name: ${p.name || p.display_name || p.title}`);
    console.log(`  Address: ${p.address1 || p.address || p.street || ""}, ${p.city || ""}, ${p.state || ""}, ${p.postal_code || p.zip || ""}`);
    
    // Find matching HHH property
    const propName = (p.name || p.display_name || "").toLowerCase();
    const city = (p.city || "").toLowerCase();
    const state = (p.state || "").toLowerCase();

    const matched = HHH_CORE_PROPERTIES.find((hhh) => {
      const hhhName = hhh.name.toLowerCase();
      const hhhCity = hhh.city.toLowerCase();
      const hhhState = hhh.state.toLowerCase();
      return (
        propName.includes(hhhCity) ||
        hhhName.includes(city) ||
        (city && hhhCity === city && state && hhhState === state)
      );
    });

    if (matched) {
      console.log(`  MATCHES HHH Property:`);
      console.log(`    HHH UUID: ${matched.id}`);
      console.log(`    HHH Name: ${matched.name}`);
      console.log(`    HHH Location: ${matched.city}, ${matched.state}`);
      console.log(`    Current Hospitable ID: ${matched.hospitableId}`);
    } else {
      console.log(`  Could not automatically match to one of the 4 HHH core properties.`);
    }
  }

  // Target C: Live Bookings & Source Fields
  console.log("\n---------------------------------------------------------------");
  console.log("TARGET C: LIVE BOOKING INSPECTION & SOURCE FIELD IDENTIFICATION");
  console.log("---------------------------------------------------------------");
  const bookingsResponse = await getOwnerRezBookings({ limit: 5 });
  console.log("Raw bookings response:\n", JSON.stringify(bookingsResponse, null, 2));

  let bookingsList: any[] = [];
  if (Array.isArray(bookingsResponse)) {
    bookingsList = bookingsResponse;
  } else if (bookingsResponse && typeof bookingsResponse === "object" && Array.isArray((bookingsResponse as any).items)) {
    bookingsList = (bookingsResponse as any).items;
  }

  console.log(`\nFound ${bookingsList.length} booking(s).`);

  if (bookingsList.length > 0) {
    const firstBooking = bookingsList[0];
    const fullBooking = await getOwnerRezBooking(firstBooking.id);
    console.log("\nFull detail for first booking:\n", JSON.stringify(fullBooking, null, 2));

    console.log("\n---------------------------------------------------------------");
    console.log("TARGET D & E: SOURCE FIELD ANALYSIS");
    console.log("---------------------------------------------------------------");
    const sourceCandidates = [
      "listing_site",
      "listing_site_id",
      "custom_source",
      "custom_source_id",
      "source",
      "source_id",
      "origin",
      "channel",
      "referral",
      "widget_id"
    ];

    for (const key of Object.keys(fullBooking as object)) {
      if (sourceCandidates.some(c => key.toLowerCase().includes(c))) {
        console.log(`Source Candidate Field found: "${key}" =`, (fullBooking as any)[key]);
      }
    }
  } else {
    console.log("No bookings found in this OwnerRez account.");
  }
}

runVerification().catch((err) => {
  console.error("Verification script failure:", err);
  process.exit(1);
});
