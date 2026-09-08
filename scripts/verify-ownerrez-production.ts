/**
 * Verification script for OwnerRez on Vercel Production
 * 
 * Verifies live production endpoints on https://hh-hreviewed.vercel.app
 */

const PROD_BASE = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : "https://hh-hreviewed.vercel.app";

async function verifyEndpoint(path: string) {
  const url = `${PROD_BASE}${path}`;
  console.log(`\nTesting GET ${url}...`);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const latency = Date.now() - start;
    console.log(`Status: ${res.status} (${res.statusText}) in ${latency}ms`);
    const contentType = res.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const data = await res.json();
      console.log("JSON Response:\n", JSON.stringify(data, null, 2));
      return { status: res.status, data };
    } else {
      const text = await res.text();
      console.log("Non-JSON Response preview:\n", text.slice(0, 300));
      return { status: res.status, text };
    }
  } catch (err) {
    console.error(`Error calling ${url}:`, err);
    return { error: err };
  }
}

async function main() {
  console.log("===============================================================");
  console.log(`VERIFYING OWNERREZ VERCEL PRODUCTION DEPLOYMENT (${PROD_BASE})`);
  console.log("===============================================================");

  // 1. Health
  console.log("\n--- 1. Health Endpoint ---");
  await verifyEndpoint("/api/ownerrez/health");

  // 2. Properties
  console.log("\n--- 2. Properties Endpoint ---");
  await verifyEndpoint("/api/ownerrez/properties");

  // 3. Bookings
  console.log("\n--- 3. Bookings Endpoint ---");
  await verifyEndpoint("/api/ownerrez/bookings?property_ids=495423");
}

main().catch(console.error);
