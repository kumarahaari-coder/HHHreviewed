# HHH Tracker Review and Actual Data Setup

Reviewed: 2026-07-28

## What was changed

- Removed the Hospitable token input and localStorage token storage from the Integrations screen.
- Added server-only Hospitable API access through Next.js Route Handlers.
- Added live `/properties` and `/reservations` collection imports with pagination support.
- Added flexible normalization because Hospitable response fields may differ by endpoint and account.
- Preloaded the four current Hidden Honey Homes stays from the public website:
  - Uptown St. Augustine
  - Downtown St. Augustine
  - Ellsworth, Maine
  - Beech Mountain, North Carolina
- Removed fake partners, sites, reservations, payout history, rates, phone numbers, and financial values from the default dataset.
- Replaced invented commission rules with a 0% POC hold rule until HHH approves the commercial formula.
- Removed fake net-revenue, cleaning-fee, and service-fee estimates from webhook processing.
- Changed the webhook endpoint so it no longer claims to persist data when no server database exists.
- Updated payout eligibility so UNKNOWN payment status cannot become eligible.
- Replaced hardcoded property IDs in the Admin overview with the current property registry.

## Critical findings in the original Antigravity output

### 1. The API token was stored in the browser

The Integrations page saved the Hospitable PAT in localStorage. Any script running on the site could read it. The reviewed version reads `HOSPITABLE_PAT` only on the server.

### 2. The webhook did not actually save anything

The webhook Route Handler imported the browser localStorage database. On the server, that database returns seed defaults and does not persist writes. The endpoint could report success even though the reservation disappeared immediately.

### 3. Financial values were invented

The original webhook filled missing values using:

- 90% of booking value as amount received
- $150 cleaning fee
- $80 service fee

These values are unsafe for payout calculations and have been removed.

### 4. Attribution was only a mock self-test

The original test inserted a fake widget ID into a fake booking payload and then matched it against the same fake site. It did not prove that Hospitable sends a widget ID, referrer, or direct-booking-site identifier in real reservation data.

### 5. Partner security was visual only

Authentication accepted any password. Partner restrictions were browser filters, not database Row Level Security. The POC must not be shared with real partners until Supabase Auth and RLS are implemented.

### 6. All original business data was fictional

The original partners, websites, reservations, payout amounts, emails, phone numbers, and commission models were demo data. They have been removed from the default dataset.

## How to import live Hospitable data

1. Revoke the token previously exposed in chat and generate a new token in Hospitable.
2. Copy `.env.example` to `.env.local`.
3. Add the new token:

   ```env
   HOSPITABLE_PAT=your_new_token
   ```

4. Keep the token out of GitHub, screenshots, spreadsheets, client code, and `NEXT_PUBLIC_` variables.
5. Install and run the project:

   ```bash
   npm install
   npm run dev
   ```

6. Open `/admin/integrations`.
7. Choose the reservation date range.
8. Click **Sync Live Hospitable Data**.
9. Review:
   - property count
   - reservation count
   - financial coverage
   - booking statuses
   - raw API records
10. Confirm the four Hospitable property IDs against the four HHH stays.

## What the sync currently does

- Calls the Hospitable API from the server.
- Retrieves all available pages for properties and reservations.
- Maps API records into the current UI model.
- Stores the imported snapshot in this browser's localStorage.
- Leaves all imported reservations unattributed until a proven source identifier is mapped.
- Keeps payout at $0 when no approved partner commission is configured.

## Important POC limitation

The imported data is real, but the storage is still a browser cache. It is not shared between users or devices and is not an accounting ledger.

Before onboarding partners, implement:

- Supabase PostgreSQL persistence
- Supabase Auth
- partner-to-user mapping
- Row Level Security
- server-side Admin permissions
- durable webhook event storage
- idempotency keys
- audit logging in the database
- encrypted payout details
- backup and restore

## Attribution test to perform with real bookings

Create three actual test partner pages, each with a different iframe/widget configuration.

For each page:

1. Complete a test direct booking.
2. Sync the reservation.
3. Inspect the reservation's raw Hospitable JSON.
4. Look for a stable field identifying the originating site, such as:
   - widget ID
   - direct booking site ID
   - listing ID
   - referrer
   - campaign or referral code
   - custom metadata
5. Map that exact field to the HHH Site record.

If no reliable source field is returned, use an HHH-controlled redirect/tracking layer before sending users into the booking flow. Do not calculate partner payouts from timestamp or IP matching alone.

## Financial validation required

For at least five real reservations, compare the API response with the Hospitable dashboard and confirm whether the API exposes:

- gross booking value
- accommodation value
- taxes
- cleaning fee
- service fee
- amount collected
- outstanding balance
- refunds
- payment date
- payment status

Until this is proven, payment receipt must be manually confirmed by an HHH Admin and payouts must remain on hold.

## Current validation status

- TypeScript check: passed (`npx tsc --noEmit`)
- New/modified live-data files: passed targeted ESLint
- Full repository ESLint: still fails in several original Antigravity UI files due to React effect patterns, unused imports, and unescaped text
- Full Next.js build: not completed in the review environment because the SWC binary download returned a 503; this was an environment download failure, not a TypeScript failure

## Public HHH data sources

- https://hiddenhoneyhomes.com/
- https://hiddenhoneyhomes.com/retreats
- https://hiddenhoneyhomes.com/retreats/uptown-st-augustine-fl
- https://hiddenhoneyhomes.com/retreats/downtown-st-augustine-fl
- https://hiddenhoneyhomes.com/retreats/ellsworth-me
- https://hiddenhoneyhomes.com/book-now/beech-mountain-retreat

## Hospitable documentation

- https://developer.hospitable.com/
- https://developer.hospitable.com/docs/public-api-docs/xpyjv51qyelmp-authentication
- https://developer.hospitable.com/docs/public-api-docs/qc4x36uhxinx3-get-properties
- https://developer.hospitable.com/docs/public-api-docs/ih7nc1ovefrcs-get-reservations
- https://help.hospitable.com/en/articles/10008203-webhooks-for-reservations-properties-messages-and-reviews
