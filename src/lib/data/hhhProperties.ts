import type { Property } from "@/lib/db/schema";

/**
 * Public stay information verified from hiddenhoneyhomes.com on 2026-07-28.
 * Hospitable property IDs are intentionally blank until a secure API sync is run.
 */
export const HHH_PUBLIC_PROPERTIES: Property[] = [
  {
    id: "hhh-uptown-st-augustine",
    hospitablePropertyId: "",
    name: "Uptown St. Augustine",
    location: "St. Augustine, FL",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-updown-img1-scaled.webp",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/uptown-st-augustine-fl",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/uptown-retreat/reserve",
    summary: "A private spa-inspired retreat designed for couples to unplug, slow down, and reconnect.",
    mood: "Indulgent · Restorative · Immersive",
    minimumAge: 25,
    maximumOccupancy: 2,
    sourceUrl: "https://hiddenhoneyhomes.com/retreats/uptown-st-augustine-fl",
    sourceVerifiedAt: "2026-07-28",
    syncStatus: "PUBLIC_SITE_ONLY",
    status: "ACTIVE"
  },
  {
    id: "hhh-downtown-st-augustine",
    hospitablePropertyId: "",
    name: "Downtown St. Augustine",
    location: "St. Augustine, FL",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-down-img1-scaled.webp",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/downtown-st-augustine-fl",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/downtown-retreat",
    summary: "An adults-only retreat in the historic district, combining city access with a private, dramatic interior.",
    mood: "Bold · Dramatic · Unapologetic",
    minimumAge: 25,
    maximumOccupancy: 2,
    sourceUrl: "https://hiddenhoneyhomes.com/retreats/downtown-st-augustine-fl",
    sourceVerifiedAt: "2026-07-28",
    syncStatus: "PUBLIC_SITE_ONLY",
    status: "ACTIVE"
  },
  {
    id: "hhh-ellsworth-maine",
    hospitablePropertyId: "",
    name: "Ellsworth, Maine",
    location: "Ellsworth, ME",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/03/image1.jpg",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/ellsworth-me",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/ellsworth-retreat",
    summary: "A secluded couples retreat near Acadia National Park, balancing coastal adventure with privacy and stillness.",
    mood: "Grounded · Secluded · Wild",
    minimumAge: 25,
    maximumOccupancy: 2,
    sourceUrl: "https://hiddenhoneyhomes.com/retreats/ellsworth-me",
    sourceVerifiedAt: "2026-07-28",
    syncStatus: "PUBLIC_SITE_ONLY",
    status: "ACTIVE"
  },
  {
    id: "hhh-beech-mountain",
    hospitablePropertyId: "",
    name: "Beech Mountain, North Carolina",
    location: "Beech Mountain, NC",
    timezone: "America/New_York",
    imageUrl: "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-beeach-img1-scaled.webp",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/beech-mountain-nc",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/beech-mountain-retreat",
    summary: "A warm mountain retreat near the ski resort, designed for slow mornings, long evenings, and intentional time together.",
    mood: "Cozy · Romantic · Unhurried",
    minimumAge: 25,
    maximumOccupancy: 2,
    sourceUrl: "https://hiddenhoneyhomes.com/retreats/beech-mountain-nc",
    sourceVerifiedAt: "2026-07-28",
    syncStatus: "PUBLIC_SITE_ONLY",
    status: "ACTIVE"
  }
];
