"use client";

import React, { useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  Building,
  KeyRound,
  MousePointerClick,
  Copy,
  Check,
  TrendingUp,
  ExternalLink
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner, RedirectClick } from "@/lib/db/schema";
import { Card, Badge, Dialog } from "@/components/ui/custom";
import { getAllPartners, getAllSites, createSiteWithFourPropertyMappings } from "@/lib/supabase/data-store";
import { validateFourPropertyWidgetMappings } from "@/lib/hospitable/widgets";

const CORE_PROPERTIES = [
  { id: "38d9159e-a35d-405e-826e-7381ad3c3197", name: "Uptown St. Augustine", location: "St. Augustine, FL" },
  { id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768", name: "Downtown St. Augustine (Lincoln)", location: "St. Augustine, FL" },
  { id: "51be6158-268d-4c96-8f0b-9968f544ddfa", name: "Ellsworth, Maine", location: "Ellsworth, ME" },
  { id: "55791a54-b1a3-459e-bbd5-9073a418b774", name: "Beech Mountain, NC", location: "Beech Mountain, NC" }
];

export default function WebsiteManagement() {
  const [sites, setSites] = useState<Site[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Analytics states
  const [clickStats, setClickStats] = useState<{
    totalClicks: number;
    clicksBySite: { siteId: string; siteName: string; count: number }[];
    clicksByPartner: { partnerId: string; partnerName: string; count: number }[];
    clicksByProperty: { propertyId: string; propertyName: string; count: number }[];
    recentClicks: RedirectClick[];
  } | null>(null);

  // Form & Modal states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Form Fields
  const [siteName, setSiteName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  // 4 Widget IDs State
  const [widgetIds, setWidgetIds] = useState<Record<string, string>>({
    "38d9159e-a35d-405e-826e-7381ad3c3197": "", // Uptown
    "f0fb867d-47cd-47d4-afa6-c4bf226c1768": "", // Downtown
    "51be6158-268d-4c96-8f0b-9968f544ddfa": "", // Ellsworth
    "55791a54-b1a3-459e-bbd5-9073a418b774": ""  // Beech
  });

  const refreshData = async () => {
    setLoading(true);
    try {
      const [loadedSites, loadedPartners] = await Promise.all([
        getAllSites(),
        getAllPartners()
      ]);
      setSites(loadedSites);
      setPartners(loadedPartners);
      if (loadedPartners.length > 0 && !partnerId) {
        setPartnerId(loadedPartners[0].id);
      }

      // Fetch click analytics summary
      try {
        const res = await fetch("/api/admin/analytics/clicks");
        if (res.ok) {
          const stats = await res.json();
          setClickStats(stats);
        }
      } catch (analyticsErr) {
        console.warn("Click analytics load skipped:", analyticsErr);
      }
    } catch (err: any) {
      console.error("Failed to load site management data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleCopy = (path: string) => {
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(path);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleWidgetChange = (propId: string, val: string) => {
    setWidgetIds(prev => ({ ...prev, [propId]: val }));
    setFormError("");
  };

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!partnerId) {
      setFormError("Please select a Partner Owner.");
      return;
    }

    // Construct 4 property mappings array
    const mappings = CORE_PROPERTIES.map(p => ({
      propertyId: p.id,
      hospitableWidgetId: widgetIds[p.id] || ""
    }));

    // Perform client-side validation
    const validation = validateFourPropertyWidgetMappings(mappings);
    if (!validation.valid) {
      setFormError(validation.errors.join(". "));
      return;
    }

    setSubmitting(true);
    try {
      await createSiteWithFourPropertyMappings({
        partnerId,
        siteName,
        websiteUrl,
        trackingCode,
        mappings
      });

      setShowAddDialog(false);
      setSiteName("");
      setWebsiteUrl("");
      setTrackingCode("");
      setWidgetIds({
        "38d9159e-a35d-405e-826e-7381ad3c3197": "",
        "f0fb867d-47cd-47d4-afa6-c4bf226c1768": "",
        "51be6158-268d-4c96-8f0b-9968f544ddfa": "",
        "55791a54-b1a3-459e-bbd5-9073a418b774": ""
      });
      await refreshData();
      
      db.addNotification("SUCCESS", `Referral website "${siteName}" and 4 property widget mappings registered.`);
    } catch (err: any) {
      console.error("Site Registration Error:", err);
      setFormError(err.message || "Failed to register website.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-blush pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-6 h-6 text-brand-wine" />
            <h1 className="text-2xl font-serif font-bold text-brand-plum">Referral Websites & Tracking</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Manage partner referral websites, deterministic tracking links, and click analytics.
          </p>
        </div>

        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2 bg-brand-plum hover:bg-brand-wine text-brand-cream text-xs font-bold px-4 py-2.5 rounded-lg shadow-md transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Register Referral Website
        </button>
      </div>

      {/* Click Analytics KPI Summary */}
      {clickStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-brand-wine">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Total Redirect Clicks</span>
              <MousePointerClick className="w-4 h-4 text-brand-wine" />
            </div>
            <div className="text-2xl font-bold font-serif text-brand-plum mt-1">{clickStats.totalClicks}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">30-day active retention</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-brand-gold">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Active Referral Sites</span>
              <Globe className="w-4 h-4 text-brand-gold" />
            </div>
            <div className="text-2xl font-bold font-serif text-brand-plum mt-1">{sites.length}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Mapped to 4 core properties</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-emerald-600">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Top Clicked Website</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-base font-bold text-brand-plum mt-1 truncate">
              {clickStats.clicksBySite[0]?.siteName || "None yet"}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {clickStats.clicksBySite[0] ? `${clickStats.clicksBySite[0].count} clicks` : "Awaiting traffic"}
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-l-indigo-600">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Top Property</span>
              <Building className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-base font-bold text-brand-plum mt-1 truncate">
              {clickStats.clicksByProperty[0]?.propertyName || "None yet"}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {clickStats.clicksByProperty[0] ? `${clickStats.clicksByProperty[0].count} clicks` : "Awaiting traffic"}
            </div>
          </Card>
        </div>
      )}

      {/* Sites List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading referral websites...</div>
        ) : sites.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <Building className="w-10 h-10 text-zinc-300 mx-auto" />
            <h3 className="font-serif font-bold text-brand-plum text-base">No Referral Websites Registered</h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Register a partner referral website to map unique Hospitable widget IDs for all 4 Hidden Honey properties.
            </p>
          </Card>
        ) : (
          sites.map(site => {
            const partner = partners.find(p => p.id === site.partnerId);

            return (
              <Card key={site.id} className="p-5 space-y-4 border border-brand-blush/80 hover:shadow-md transition-shadow">
                {/* Site Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-blush/40 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif font-bold text-lg text-brand-plum">{site.siteName}</h3>
                      <Badge type={site.status === "ACTIVE" ? "success" : "warning"}>
                        {site.status}
                      </Badge>
                    </div>
                    <a
                      href={site.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand-wine hover:underline flex items-center gap-1 mt-0.5"
                    >
                      {site.websiteUrl}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-semibold text-zinc-700">
                      Partner: {partner?.contactName || "Unassigned"} ({partner?.businessName || "No Business"})
                    </div>
                    <div className="text-[11px] font-mono font-bold text-brand-wine mt-0.5">
                      Tracking Code: {site.trackingCode}
                    </div>
                  </div>
                </div>

                {/* 4 Mapped Properties Grid with Deterministic Tracking Links */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-wine mb-2">
                    Deterministic Tracking Links (4 Core Properties)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {CORE_PROPERTIES.map(cp => {
                      const propMapping = site.siteProperties?.find(sp => sp.propertyId === cp.id);
                      const widgetIdVal = propMapping?.hospitableWidgetId || site.hospitableWidgetId || "Not Mapped";
                      const trackingPath = `/r/${site.id}/${cp.id}`;
                      const isCopied = copiedLink === trackingPath;

                      return (
                        <div key={cp.id} className="bg-brand-bg/60 p-3 rounded-lg border border-brand-blush/60 space-y-2">
                          <div>
                            <div className="text-xs font-bold text-brand-plum">{cp.name}</div>
                            <div className="text-[10px] text-zinc-500">{cp.location}</div>
                          </div>

                          <div className="bg-white/80 p-1.5 rounded border border-brand-blush/40 flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[120px]">
                              {trackingPath}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(trackingPath)}
                              className="p-1 hover:bg-brand-blush/30 rounded text-brand-wine transition-colors"
                              title="Copy Tracking Link"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-brand-blush/30 text-[10px]">
                            <span className="text-zinc-400 font-mono truncate max-w-[100px]" title={widgetIdVal}>
                              {widgetIdVal}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              ACTIVE
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* DIALOG: REGISTER REFERRAL WEBSITE */}
      <Dialog isOpen={showAddDialog} onClose={() => setShowAddDialog(false)} title="Register Referral Website (4 Properties Required)">
        <form onSubmit={handleAddSite} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Website Name *</label>
            <input
              type="text"
              required
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder="e.g. Megs Connection Retreats"
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Assign Partner Owner *</label>
            <select
              value={partnerId}
              onChange={e => setPartnerId(e.target.value)}
              required
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2 px-2.5 focus:outline-none"
            >
              <option value="">-- Select Active Partner --</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.businessName} ({p.contactName} - {p.email})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Website URL *</label>
              <input
                type="url"
                required
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://megsconnection.com"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Custom Tracking Code *</label>
              <input
                type="text"
                required
                value={trackingCode}
                onChange={e => setTrackingCode(e.target.value)}
                placeholder="e.g. MEGS-STAYS-01"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* 4 Required Property Widget ID Inputs */}
          <div className="border-t border-brand-blush pt-3 space-y-3">
            <div className="text-xs font-bold text-brand-plum uppercase tracking-wider">
              Four Required Hospitable Widget IDs *
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-1">
              <div className="font-bold">⚠️ Widget Validation Notice:</div>
              <p>
                Hospitable API v2 does not provide a widget lookup endpoint. Widget IDs are <strong>manually entered and structurally validated</strong> (non-empty, non-placeholder, intra-site distinct). Resource loadability verification confirms embed availability, but cannot prove property ownership.
              </p>
            </div>

            <div className="space-y-2">
              {CORE_PROPERTIES.map(cp => (
                <div key={cp.id} className="bg-brand-bg/50 p-2.5 rounded-lg border border-brand-blush/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="sm:w-1/2">
                    <div className="text-xs font-bold text-brand-plum">{cp.name}</div>
                    <div className="text-[10px] text-zinc-400">{cp.location}</div>
                  </div>
                  <input
                    type="text"
                    required
                    value={widgetIds[cp.id] || ""}
                    onChange={e => handleWidgetChange(cp.id, e.target.value)}
                    placeholder={`Widget ID for ${cp.name}`}
                    className="sm:w-1/2 px-2.5 py-1.5 bg-white border border-brand-blush rounded text-xs font-mono focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine disabled:opacity-50 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md mt-4"
          >
            {submitting ? "Validating & Registering..." : "Register Website & 4 Mappings"}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
