"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { Globe, Clipboard, Copy, Info, Check, Building } from "lucide-react";
import { getAllSites, getAllPartners } from "@/lib/supabase/data-store";

const CORE_PROPERTIES = [
  { id: "38d9159e-a35d-405e-826e-7381ad3c3197", name: "Uptown St. Augustine", location: "St. Augustine, FL" },
  { id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768", name: "Downtown St. Augustine (Lincoln)", location: "St. Augustine, FL" },
  { id: "51be6158-268d-4c96-8f0b-9968f544ddfa", name: "Ellsworth, Maine", location: "Ellsworth, ME" },
  { id: "55791a54-b1a3-459e-bbd5-9073a418b774", name: "Beech Mountain, NC", location: "Beech Mountain, NC" }
];

export default function PartnerSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPartnerSites() {
      setLoading(true);
      try {
        const user = db.currentUser;
        const allPartners = await getAllPartners();
        const activePartner = allPartners.find(p => (user?.partnerId && p.id === user.partnerId) || p.status === "ACTIVE") || allPartners[0] || null;
        setPartner(activePartner);

        const allSites = await getAllSites();
        if (activePartner) {
          setSites(allSites.filter(s => s.partnerId === activePartner.id));
        } else {
          setSites(allSites);
        }
      } catch (err) {
        console.error("Error loading partner sites:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPartnerSites();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">My Referral Websites & Mappings</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Review your registered websites, tracking codes, and 4-property Hospitable widget status.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-zinc-400">Loading your referral websites...</div>
      ) : sites.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Building className="w-10 h-10 text-zinc-300 mx-auto" />
          <h3 className="font-serif font-bold text-brand-plum text-base">No Websites Registered Yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Contact Hidden Honey Homes Admin to register your referral website with 4-property Hospitable widget mappings.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {sites.map(site => (
            <Card key={site.id} className="space-y-6 p-6 border border-brand-blush">
              {/* Header info */}
              <div className="flex justify-between items-start border-b border-brand-blush/60 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-brand-plum">{site.siteName}</h3>
                  <a href={site.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-wine hover:underline">
                    {site.websiteUrl}
                  </a>
                </div>
                <Badge type={site.status === "ACTIVE" ? "success" : "warning"}>{site.status}</Badge>
              </div>

              {/* Unique Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-brand-bg/50 p-4 rounded-lg border border-brand-blush/40">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                    Tracking Code
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-brand-wine">{site.trackingCode}</span>
                    <button
                      onClick={() => handleCopy(site.trackingCode, `tc-${site.id}`)}
                      className="p-1 text-zinc-400 hover:text-brand-wine rounded transition-colors"
                      title="Copy Tracking Code"
                    >
                      {copiedId === `tc-${site.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                    Website URL
                  </span>
                  <div className="text-xs text-zinc-700 font-medium truncate">{site.websiteUrl}</div>
                </div>
              </div>

              {/* 4 Mapped Properties */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine">
                  Mapped Hidden Honey Property Widgets (4 Core Properties)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {CORE_PROPERTIES.map(cp => {
                    const propMapping = site.siteProperties?.find(sp => sp.propertyId === cp.id);
                    const widgetVal = propMapping?.hospitableWidgetId || site.hospitableWidgetId || "Mapped";

                    return (
                      <div key={cp.id} className="bg-white p-3 rounded-lg border border-brand-blush/60 space-y-1 shadow-sm">
                        <div className="text-xs font-bold text-brand-plum">{cp.name}</div>
                        <div className="text-[10px] text-zinc-500">{cp.location}</div>
                        <div className="flex items-center justify-between pt-1 border-t border-brand-blush/30 mt-1">
                          <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[110px]">
                            {widgetVal}
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
          ))}
        </div>
      )}
    </div>
  );
}
