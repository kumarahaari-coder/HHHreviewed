"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner, CommissionRule } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { Globe, Clipboard, Copy, Info, Check } from "lucide-react";

export default function PartnerSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    setPartner(db.partners.find(p => p.id === user.partnerId) || null);
    
    // RLS filtering
    setSites(db.sites.filter(s => s.partnerId === user.partnerId));
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!partner) return null;

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">My Registered Websites</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Review your tracking variables and retrieve booking widgets for your templates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {sites.map(site => (
          <Card key={site.id} className="space-y-6">
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

            {/* Embedded integration instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Variables */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine">Integration Credentials</h4>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-zinc-400 block mb-1">HOSPITABLE WIDGET ID</span>
                    <div className="flex items-center space-x-2">
                      <code className="font-mono bg-brand-bg border border-brand-blush px-2 py-1.5 rounded text-zinc-700 block flex-1">
                        {site.hospitableWidgetId}
                      </code>
                      <button
                        onClick={() => handleCopy(site.hospitableWidgetId, `widget-${site.id}`)}
                        className="p-2 bg-brand-blush/40 hover:bg-brand-blush text-brand-plum rounded border border-brand-blush/60 transition-colors"
                      >
                        {copiedId === `widget-${site.id}` ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-zinc-400 block mb-1">CAMPAIGN / REFERRAL CODE</span>
                    <div className="flex items-center space-x-2">
                      <code className="font-mono bg-brand-bg border border-brand-blush px-2 py-1.5 rounded text-zinc-700 block flex-1 font-bold">
                        {site.trackingCode}
                      </code>
                      <button
                        onClick={() => handleCopy(site.trackingCode, `code-${site.id}`)}
                        className="p-2 bg-brand-blush/40 hover:bg-brand-blush text-brand-plum rounded border border-brand-blush/60 transition-colors"
                      >
                        {copiedId === `code-${site.id}` ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-brand-blush/10 border border-brand-blush/40 p-4 rounded-xl space-y-3 text-xs text-zinc-600">
                <h4 className="font-bold text-brand-plum flex items-center gap-1.5">
                  <Info size={14} />
                  How to Embed the Booking Widget
                </h4>
                <p className="leading-relaxed">
                  To ensure referrals are attributed correctly to your profile, copy your unique <span className="font-semibold text-brand-plum">Hospitable Widget ID</span> above and insert it into the booking widget options on your website.
                </p>
                <p className="leading-relaxed">
                  When guests complete bookings through this specific widget, the HHH engine automatically tracks the referral source and records your commission.
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
