"use client";

import React, { useEffect, useState, Suspense } from "react";
import { Site } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Globe, Copy, Check, Building, ExternalLink } from "lucide-react";
import { LoadingState, ErrorBanner } from "@/components/ui";
import { useSearchParams } from "next/navigation";

const CORE_PROPERTIES = [
  { id: "38d9159e-a35d-405e-826e-7381ad3c3197", name: "Uptown St. Augustine", location: "St. Augustine, FL" },
  { id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768", name: "Downtown St. Augustine (Lincoln)", location: "St. Augustine, FL" },
  { id: "51be6158-268d-4c96-8f0b-9968f544ddfa", name: "Ellsworth, Maine", location: "Ellsworth, ME" },
  { id: "55791a54-b1a3-459e-bbd5-9073a418b774", name: "Beech Mountain, NC", location: "Beech Mountain, NC" }
];

function PartnerSitesContent() {
  const searchParams = useSearchParams();
  const previewPartnerId = searchParams.get("previewPartnerId");

  const [sites, setSites] = useState<Site[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function loadPartnerSites() {
      try {
        // The server decides which partner's sites to return from the logged-in session.
        const url = previewPartnerId
          ? `/api/partner/sites?previewPartnerId=${encodeURIComponent(previewPartnerId)}`
          : "/api/partner/sites";
        const res = await fetch(url);
        const data = await res.json();
        if (!isSubscribed) return;

        if (res.ok && data.success && Array.isArray(data.sites)) {
          setSites(data.sites);
        } else {
          setError(data?.error || "Unable to load your websites.");
        }
      } catch (err) {
        console.error("Error loading partner sites:", err);
        if (isSubscribed) setError("Unable to load your websites. Please refresh the page.");
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    loadPartnerSites();
    return () => {
      isSubscribed = false;
    };
  }, [previewPartnerId]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Websites"
        description="Review your registered referral websites, tracking credentials, and property mappings."
      />

      {loading ? (
        <LoadingState message="Loading your websites..." />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : sites.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Building className="w-10 h-10 text-[#6E6E73] mx-auto" />
          <h3 className="font-semibold text-[#1D1D1F] text-base">No Websites Registered Yet</h3>
          <p className="text-xs text-[#6E6E73] max-w-md mx-auto">
            Contact Hidden Honey Homes Admin to register your referral website and link your properties.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {sites.map(site => (
            <Card key={site.id} className="space-y-6 p-6">
              {/* Header info */}
              <div className="flex justify-between items-start border-b border-[#E8E8ED] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#1D1D1F] flex items-center gap-2">
                    <Globe size={18} className="text-[#6E6E73]" />
                    {site.siteName}
                  </h3>
                  <a
                    href={site.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] flex items-center gap-1 mt-1 underline"
                  >
                    <span>{site.websiteUrl}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
                <StatusBadge variant={site.status === "ACTIVE" ? "success" : "warning"}>{site.status}</StatusBadge>
              </div>

              {/* Unique Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-[#E8E8ED]">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6E73] block mb-1">
                    Tracking Code
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm text-[#1D1D1F]">{site.trackingCode}</span>
                    <button
                      onClick={() => handleCopy(site.trackingCode, `tc-${site.id}`)}
                      className="p-1 text-[#6E6E73] hover:text-[#1D1D1F] rounded transition-colors"
                      title="Copy Tracking Code"
                    >
                      {copiedId === `tc-${site.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6E73] block mb-1">
                    Registered Domain
                  </span>
                  <div className="text-xs font-medium text-[#1D1D1F] truncate">{site.websiteUrl}</div>
                </div>
              </div>

              {/* 4 Mapped Properties */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6E6E73]">
                  Mapped Properties (4 Core Properties)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {CORE_PROPERTIES.map(cp => {
                    return (
                      <div key={cp.id} className="bg-[#FFFFFF] p-3 rounded-lg border border-[#D2D2D7] space-y-1 shadow-2xs">
                        <div className="text-xs font-semibold text-[#1D1D1F]">{cp.name}</div>
                        <div className="text-[10px] text-[#6E6E73]">{cp.location}</div>
                        <div className="flex items-center justify-between pt-2 border-t border-[#E8E8ED] mt-1">
                          <span className="text-[10px] text-[#6E6E73] font-mono truncate max-w-[110px]">
                            Synced
                          </span>
                          <StatusBadge variant="success">ACTIVE</StatusBadge>
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

export default function PartnerSites() {
  return (
    <Suspense fallback={<LoadingState message="Loading your websites..." />}>
      <PartnerSitesContent />
    </Suspense>
  );
}
