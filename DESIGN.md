---
version: alpha
name: HHH
description: Canonical visual-design contract for the HHH operational platform (Hidden Honey Homes)
colors:
  canvas: "#F5F5F7"
  surface: "#FFFFFF"
  surface-subtle: "#FBFBFD"
  surface-muted: "#F0F0F2"
  primary: "#1D1D1F"
  secondary: "#6E6E73"
  tertiary: "#86868B"
  divider: "#D2D2D7"
  divider-soft: "#E8E8ED"
  accent: "#B7791F"
  accent-hover: "#975A16"
  accent-subtle: "#FDF6EC"
  success: "#1B5E20"
  success-surface: "#EDF7ED"
  success-border: "#C8E6C9"
  warning: "#8A4200"
  warning-surface: "#FFF4E5"
  warning-border: "#FFE0B2"
  danger: "#C62828"
  danger-surface: "#FDEDED"
  danger-border: "#FFCDD2"
  info: "#01579B"
  info-surface: "#E1F5FE"
  info-border: "#B3E5FC"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  title-lg:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.015em
  title-md:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  title-sm:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.35
  body-md:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  table-header:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.01em
  table-cell:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  numeric-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: '"tnum"'
  badge:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
rounded:
  none: 0px
  xs: 3px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 48px
  "4xl": 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  badge-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  badge-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  badge-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  badge-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
---

# HHH Design System

## Overview

The HHH design system defines the visual and operational identity for the Hidden Honey Homes reservation, partner attribution, and commission settlement platform. It enforces a calm, precise, trustworthy, functional, and premium aesthetic.

Taking inspiration from Apple system software principles — distinct structural hierarchy, typographical clarity, visual restraint, predictable behavior, and purposeful whitespace — the design is strictly operational. It consciously rejects decorative gimmicks, heavy artificial shadows, and saturated gradients.

### Product Identity

- **Primary Visible Brand**: **HHH**
- **Secondary Descriptor**: *Hidden Honey Homes* (used in titles, headers, and context-dependent footers)
- **Application Variants**:
  - HHH Admin
  - HHH Partner
  - HHH / Hidden Honey Homes
- **Legal Entity**: *Hidden Honey Homes LLC* remains unchanged on formal statements, settlement receipts, and compliance tax exports.
- **Iconography Policy**: No decorative house, roof, bee, key, or map-pin logos. The brand identity is grounded in a refined, typographic HHH monogram.

## Colors

The HHH palette is rooted in neutral surfaces, high-contrast graphite typography, subtle structural dividers, and a singular honey accent.

### Base Palette

- **Canvas (`#F5F5F7`)**: Quiet light-gray canvas providing separation from pure-white content cards without high contrast fatigue.
- **Surface (`#FFFFFF`)**: Pure-white background for cards, tables, modals, and sheets.
- **Surface Subtle (`#FBFBFD`)**: Alternating table rows and quiet card headers.
- **Surface Muted (`#F0F0F2`)**: Active segmented control backgrounds and pressed states.
- **Primary Text (`#1D1D1F`)**: Deep graphite for headers, primary transactional labels, high-importance data, and primary button backgrounds.
- **Secondary Text (`#6E6E73`)**: Restrained slate for supporting labels, table headers, descriptions, and metadata.
- **Tertiary Text (`#86868B`)**: Muted slate for placeholders, timestamps, and de-emphasized footnotes.
- **Divider (`#D2D2D7`)**: Solid crisp borders for cards, modals, and active separators.
- **Divider Soft (`#E8E8ED`)**: Hairline dividers between table rows and list items.

### Accent & Semantics

- **HHH Honey Accent (`#B7791F`)**: Identity and accent highlight. Used for active navigation accents, selection indicator marks, and brand badging. Because honey against white provides a ~3.65:1 contrast ratio, it is **never** used for small body text, critical button labels, or unbordered focus indicators.
- **Success (`#1B5E20`) / Container (`#EDF7ED`) / Border (`#C8E6C9`)**: Attributed bookings, realized payments, and settled payouts.
- **Warning (`#8A4200`) / Container (`#FFF4E5`) / Border (`#FFE0B2`)**: Review required, missing accrual inspection, and lock-timeout warnings.
- **Danger (`#C62828`) / Container (`#FDEDED`) / Border (`#FFCDD2`)**: Cancelled reservations, reconciliation failures, and destructive operations.
- **Info (`#01579B`) / Container (`#E1F5FE`) / Border (`#B3E5FC`)**: Webhook status notices, sync progress indicators, and audit telemetry.

Color is never the sole conveyor of status; all semantic states pair with explicit text labels and standard status icons.

## Typography

HHH typography is anchored in the native system font stack to ensure immediate rendering, zero network latency, and platform-native font smoothing:

`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif`

Proprietary fonts are not bundled. The legacy Google Assistant font and italic serif subtitle styling are eliminated.

### Typographic Hierarchy

- **Sentence case by default**: All headings, buttons, and navigation labels use natural sentence case. Repetitive uppercase eyebrow styling is removed.
- **Table Headers**: Set at `12px` (`table-header`) with `fontWeight: 500` in secondary text (`#6E6E73`). Never transformed to unreadable tiny uppercase text.
- **Financial & Numerical Precision**: All currency amounts, check-in dates, commission percentages, and transaction counts use tabular numbers (`font-variant-numeric: tabular-nums` / `fontFeature: '"tnum"'`) to ensure perfect vertical alignment across ledger columns.

## Layout

HHH utilizes a strict 8px-derived spacing system with a 4px half-step for micro-alignment:

`4px (xs) / 8px (sm) / 12px (md) / 16px (lg) / 24px (xl) / 32px (2xl) / 48px (3xl) / 64px (4xl)`

### Application Architecture

1. **Persistent Shell (Desktop)**:
   - Fixed 240px sidebar with restrained brand monogram and clear navigation grouping.
   - Quiet top header (`56px`) displaying page title, role context, and notifications.
   - Fluid content canvas with max-width containment (`max-w-7xl`) for wide screens.
2. **Adaptive Navigation (Tablet / Mobile)**:
   - Below 1024px, the desktop sidebar collapses into a sliding sheet/drawer triggered by a standard menu button in the sticky top header.
   - Table views wrap horizontally or adapt into structured operational cards rather than forcing full-page horizontal scrolling.
3. **Density Balance**:
   - Generous breathing room (24px to 32px view padding) without enterprise bloat. Table rows maintain a compact, readable 44px to 48px height.

## Elevation & Depth

HHH interfaces are predominantly flat, establishing hierarchy through:

1. Surface contrast (`#FFFFFF` against `#F5F5F7`)
2. Subtle structural dividers (`#D2D2D7` and `#E8E8ED`)
3. Purposeful spacing

Drop shadows are reserved strictly for transient overlays that float above the operational workspace:

- **Modals / Dialogs**: `0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)`
- **Drawers / SlideOvers**: `-10px 0 20px -5px rgba(0, 0, 0, 0.06)`
- **Dropdowns & Popovers**: `0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04)`

Cards, tables, and toolbars do not use heavy shadows, decorative gradients, glowing borders, or artificial glassmorphism.

## Shapes

Shapes are crisp and restrained:

- **Interactive Inputs & Buttons**: `6px` to `8px` (`rounded-md`).
- **Cards & Data Tables**: `12px` (`rounded-lg`).
- **Transient Dialogs & Sheets**: `12px` to `16px` (`rounded-xl`).
- **Status Badges & Segmented Controls**: `9999px` (`rounded-full`).

Pill styling is restricted to status badges, compact filter tags, and segmented toggles. Standard buttons and cards are never pills.

## Components

### Button

- **Primary**: Solid graphite (`#1D1D1F`) background with pure white text (`#FFFFFF`). Delivers authoritative contrast (16.1:1) for primary transactional commitments (e.g., "Create Batch", "Apply Rule").
- **Secondary**: Pure white surface (`#FFFFFF`) with graphite text (`#1D1D1F`) and crisp divider border (`#D2D2D7`). Used for standard actions (e.g., "Export CSV", "Filter").
- **Tertiary**: Transparent / canvas background with graphite text. Used for quiet inline triggers and navigation links.
- **Destructive**: Crimson red (`#C62828`) background with pure white text (`#FFFFFF`) for permanent operations (e.g., "Cancel Booking", "Delete Source").
- **States**: Subtle hover (`opacity: 0.9` or darkened surface), active pressed scale (`active:scale-[0.99]`), and high-visibility keyboard focus ring (`ring-2 ring-primary ring-offset-2`).

### PageHeader

Unified title container providing page title, descriptive subtitle, and trailing action slot. Consistent across both Admin and Partner portals.

### Table & Data Display

- Subtle top/bottom borders on header cells.
- Subtle `#E8E8ED` horizontal row dividers; no vertical column grid lines.
- Right-aligned currency and numeric columns with tabular font behavior.
- Status badges positioned consistently in dedicated status columns.
- Operational actions tucked into clean trailing action cells or row click triggers.

### Form Elements (Input, Select, Textarea, Checkbox)

- Consistent `38px` height for inputs and selects.
- Crisp `#D2D2D7` border on neutral `#FFFFFF` surface.
- Unambiguous focus state using graphite ring.
- Explicit label and helper/error text in secondary/danger colors.

### Feedback (LoadingState, EmptyState, ErrorBanner)

- Consistent empty states featuring a quiet `36px` Lucide icon, clear title, concise description, and optional call-to-action button.
- Restrained spinners and skeleton loaders matching the exact card/table geometry.
- Error banners with explicit semantic border, container tint, and structured error description.

## Do's and Don'ts

### Do's

- **Do** use graphite (`#1D1D1F`) as the primary button and primary text color.
- **Do** format all financial figures and dates with tabular numbers (`tabular-nums`).
- **Do** use natural sentence case for headers, navigation links, and action buttons.
- **Do** provide explicit text labels alongside status indicator colors.
- **Do** maintain a flat visual hierarchy relying on spacing, dividers, and surface shades.
- **Do** ensure all interactive controls have accessible `:focus-visible` styling.

### Don'ts

- **Don't** use honey (`#B7791F`) as universal button color or for small text against light backgrounds.
- **Don't** use decorative serif or italic subtitle styles.
- **Don't** use emoji as production UI icons. Use only Lucide icons.
- **Don't** transform table headers into 10px uppercase labels.
- **Don't** add decorative glassmorphism, glowing drop-shadows, or saturated gradients.
- **Don't** turn standard buttons or content cards into pills.
- **Don't** alter Clerk auth, OwnerRez PAT/webhook, commission ledger, or settlement switches during design updates.
