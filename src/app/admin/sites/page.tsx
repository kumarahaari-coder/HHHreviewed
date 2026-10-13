"use client";

import React, { useEffect, useState, useCallback, memo } from "react";
import {
  Globe,
  Plus,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  X,
  Copy,
  Check,
  Link as LinkIcon,
  Sparkles,
  Settings,
  RefreshCw
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner, SiteReadinessStage } from "@/lib/db/schema";
import {
  Card,
  StatusBadge,
  SlideOver,
  PageHeader,
  Button,
  LoadingState,
  EmptyState,
  ErrorBanner,
  TableContainer,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableMobileCard,
  Dialog,
  StatusType
} from "@/components/ui";

const CORE_PROPERTIES = [
  { id: "38d9159e-a35d-405e-826e-7381ad3c3197", name: "Uptown St. Augustine", listingId: 595517 },
  { id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768", name: "Downtown St. Augustine (Lincoln)", listingId: 595516 },
  { id: "51be6158-268d-4c96-8f0b-9968f544ddfa", name: "Ellsworth, Maine", listingId: 595518 },
  { id: "55791a54-b1a3-459e-bbd5-9073a418b774", name: "Beech Mountain, NC", listingId: 595515 }
];

function getReadinessBadgeVariant(stage?: SiteReadinessStage): StatusType {
  switch (stage) {
    case "ATTRIBUTION_VERIFIED": return "success";
    case "BOOKING_ATTRIBUTION_UNPROVEN": return "plum";
    case "CLICK_TRACKING_VERIFIED": return "warning";
    case "BOOKING_LINKS_CONFIGURED": return "info";
    case "REGISTERED":
    default:
      return "neutral";
  }
}

function formatReadinessLabel(stage?: SiteReadinessStage): string {
  switch (stage) {
    case "ATTRIBUTION_VERIFIED": return "Attribution Verified";
    case "BOOKING_ATTRIBUTION_UNPROVEN": return "Attribution Unproven";
    case "CLICK_TRACKING_VERIFIED": return "Clicks Verified";
    case "BOOKING_LINKS_CONFIGURED": return "Links Configured";
    case "REGISTERED":
    default:
      return "Registered";
  }
}

function getReadinessDescription(stage?: SiteReadinessStage): string {
  switch (stage) {
    case "ATTRIBUTION_VERIFIED":
      return "Authoritative financial commission ledger events recorded. Referral attribution fully proven.";
    case "BOOKING_ATTRIBUTION_UNPROVEN":
      return "Referral clicks and reservations recorded, awaiting financial reconciliation and attribution settlement.";
    case "CLICK_TRACKING_VERIFIED":
      return "Inbound clicks successfully tracked through HHH referral redirect route.";
    case "BOOKING_LINKS_CONFIGURED":
      return "Property booking destinations configured (Hostaway direct booking engine / widgets).";
    case "REGISTERED":
    default:
      return "Website identity registered and linked to partner. Booking destination links pending.";
  }
}

export default function WebsiteManagement() {
  const [sites, setSites] = useState<Site[]>(db.sites || []);
  const [partners, setPartners] = useState<Partner[]>(db.partners || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Modals
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [configuringSite, setConfiguringSite] = useState<Site | null>(null);

  const refreshData = useCallback(async () => {
    try {
      setError(null);
      const [sitesRes, partnersRes] = await Promise.all([
        fetch("/api/admin/sites").catch(() => null),
        fetch("/api/admin/partners").catch(() => null)
      ]);

      if (sitesRes && sitesRes.ok) {
        const sData = await sitesRes.json();
        if (sData.success && Array.isArray(sData.sites)) {
          setSites(sData.sites);
          if (selectedSite) {
            const updated = sData.sites.find((s: Site) => s.id === selectedSite.id);
            if (updated) setSelectedSite(updated);
          }
        }
      }

      if (partnersRes && partnersRes.ok) {
        const pData = await partnersRes.json();
        if (pData.success && Array.isArray(pData.partners)) {
          setPartners(pData.partners);
        }
      }
    } catch (err: any) {
      console.error("[Sites Page] Refresh error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleCopy = (path: string) => {
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(path);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // Filter Logic
  const filteredSites = sites.filter(s => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = s.siteName?.toLowerCase().includes(q);
      const matchUrl = s.websiteUrl?.toLowerCase().includes(q);
      const matchCode = s.trackingCode?.toLowerCase().includes(q);
      const partnerObj = partners.find(p => p.id === s.partnerId);
      const matchPartner = partnerObj?.contactName?.toLowerCase().includes(q) || partnerObj?.businessName?.toLowerCase().includes(q);
      if (!matchName && !matchUrl && !matchCode && !matchPartner) return false;
    }

    if (selectedStatus !== "ALL" && s.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  if (loading) {
    return <LoadingState message="Loading Referral Websites registry..." />;
  }

  return (
    <div className="space-y-6 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Sites"
        description="Referral websites, tracking links, and OwnerRez listing source mappings."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowAddDialog(true)}
          >
            Register Website
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* 2. Controls & Search Bar */}
      <Card variant="default" className="p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary pointer-events-none">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search website name, domain, partner, or tracking code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-secondary hover:text-primary cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="PAUSED">Paused Only</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => refreshData()}
              title="Refresh"
            >
              Sync
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Desktop Operational Table (>=768px) */}
      <div className="hidden md:block">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Website Name & Domain</TableHead>
                <TableHead>Partner Owner</TableHead>
                <TableHead>Tracking Identity</TableHead>
                <TableHead align="center">Readiness Stage</TableHead>
                <TableHead align="center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8">
                    <EmptyState
                      title="No referral sites found"
                      description="No website records match active filters."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredSites.map(s => {
                  const partner = partners.find(p => p.id === s.partnerId);
                  const displayName = s.siteName === "Haari tEst" ? "Megbrass Referral Site" : s.siteName;
                  const readinessStage = s.readinessStage || (s.siteProperties && s.siteProperties.length > 0 ? "BOOKING_LINKS_CONFIGURED" : "REGISTERED");

                  return (
                    <TableRow
                      key={s.id}
                      onClick={() => setSelectedSite(s)}
                    >
                      {/* Column 1: Site Name & URL */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-primary">{displayName}</div>
                          {s.websiteUrl && (
                            <a
                              href={s.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[11px] text-secondary hover:text-accent-hover flex items-center gap-1 font-sans"
                            >
                              <span>{s.websiteUrl.replace(/^https?:\/\//, "")}</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </TableCell>

                      {/* Column 2: Partner Owner */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-primary">{partner?.contactName || "Unassigned"}</div>
                          <div className="text-[11px] text-secondary">{partner?.businessName || "No business record"}</div>
                        </div>
                      </TableCell>

                      {/* Column 3: Diagnostic Code */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-xs font-mono font-semibold text-primary">
                            {s.trackingCode}
                          </div>
                          <div className="text-[10px] text-tertiary">
                            {s.siteProperties ? `${s.siteProperties.length} property link(s)` : "0 links"}
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 4: Readiness Stage */}
                      <TableCell align="center">
                        <StatusBadge variant={getReadinessBadgeVariant(readinessStage)}>
                          {formatReadinessLabel(readinessStage)}
                        </StatusBadge>
                      </TableCell>

                      {/* Column 5: Action */}
                      <TableCell align="center">
                        <Button
                          variant="tertiary"
                          size="sm"
                          icon={Eye}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSite(s);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* 4. Mobile Operational Card Stack (<768px) */}
      <div className="block md:hidden space-y-3">
        {filteredSites.length === 0 ? (
          <EmptyState
            title="No referral sites found"
            description="No website records match active filters."
          />
        ) : (
          filteredSites.map(s => {
            const partner = partners.find(p => p.id === s.partnerId);
            const readinessStage = s.readinessStage || (s.siteProperties && s.siteProperties.length > 0 ? "BOOKING_LINKS_CONFIGURED" : "REGISTERED");

            return (
              <TableMobileCard
                key={s.id}
                title={s.siteName}
                subtitle={s.websiteUrl ? s.websiteUrl.replace(/^https?:\/\//, "") : "No domain set"}
                badge={
                  <StatusBadge variant={getReadinessBadgeVariant(readinessStage)}>
                    {formatReadinessLabel(readinessStage)}
                  </StatusBadge>
                }
                action={
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={Eye}
                    onClick={() => setSelectedSite(s)}
                  />
                }
                details={[
                  { label: "Partner Owner", value: partner?.contactName || "Unassigned" },
                  { label: "Tracking Code", value: s.trackingCode }
                ]}
              />
            );
          })
        )}
      </div>

      {/* 5. Site Detail SlideOver Drawer */}
      <SlideOver
        isOpen={selectedSite !== null}
        onClose={() => setSelectedSite(null)}
        size="lg"
        title={selectedSite ? selectedSite.siteName : "Website Detail"}
        description={selectedSite ? selectedSite.websiteUrl : undefined}
      >
        {selectedSite && (() => {
          const partner = partners.find(p => p.id === selectedSite.partnerId);
          const readinessStage = selectedSite.readinessStage || (selectedSite.siteProperties && selectedSite.siteProperties.length > 0 ? "BOOKING_LINKS_CONFIGURED" : "REGISTERED");

          return (
            <div className="space-y-5 font-sans py-1">
              {/* Site Details */}
              <div className="bg-surface-subtle border border-divider-soft rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Site Title:</span>
                  <span className="text-xs font-semibold text-primary">{selectedSite.siteName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Website Domain:</span>
                  <span className="text-xs font-mono text-primary">{selectedSite.websiteUrl || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Tracking Code:</span>
                  <span className="text-xs font-mono font-semibold text-primary">{selectedSite.trackingCode}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-divider-soft">
                  <span className="text-xs font-medium text-secondary">Readiness Stage:</span>
                  <StatusBadge variant={getReadinessBadgeVariant(readinessStage)}>
                    {formatReadinessLabel(readinessStage)}
                  </StatusBadge>
                </div>
                <p className="text-[11px] text-tertiary pt-0.5 leading-relaxed">
                  {getReadinessDescription(readinessStage)}
                </p>
              </div>

              {/* Partner Owner */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Partner Owner Context
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Partner Name:</span>
                    <span className="text-xs font-semibold text-primary">{partner?.contactName || "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Business:</span>
                    <span className="text-xs font-semibold text-primary">{partner?.businessName || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Email:</span>
                    <span className="text-xs font-mono text-primary">{partner?.email || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Property Booking Destinations Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                    Property Booking Destinations
                  </h4>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Settings}
                    onClick={() => setConfiguringSite(selectedSite)}
                  >
                    Configure Links
                  </Button>
                </div>

                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-3">
                  {CORE_PROPERTIES.map(prop => {
                    const mappedProp = (selectedSite.siteProperties || []).find(sp => sp.propertyId === prop.id);
                    const redirectPath = `/r/${selectedSite.id}/${prop.id}`;
                    const isCopied = copiedLink === redirectPath;

                    return (
                      <div key={prop.id} className="p-3 bg-surface-subtle border border-divider-soft rounded-md space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-primary">{prop.name}</span>
                          {mappedProp ? (
                            <Button
                              variant="tertiary"
                              size="sm"
                              icon={isCopied ? Check : Copy}
                              onClick={() => handleCopy(redirectPath)}
                            >
                              {isCopied ? "Copied" : "Copy Link"}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-tertiary">Unlinked</span>
                          )}
                        </div>

                        {mappedProp ? (
                          <div className="space-y-1">
                            <div className="text-[11px] font-mono text-secondary truncate">
                              Tracking route: <span className="text-primary font-semibold">{redirectPath}</span>
                            </div>
                            <div className="text-[10px] text-tertiary truncate">
                              Destination: {mappedProp.customBookingUrl || `Widget ID: ${mappedProp.hospitableWidgetId}`}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-secondary italic">
                            Destination booking URL not yet configured.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* 6. Add Site Dialog Component */}
      <AddSiteModal
        isOpen={showAddDialog}
        partners={partners}
        onClose={() => setShowAddDialog(false)}
        onSuccess={async (newSite) => {
          setShowAddDialog(false);
          await refreshData();
          setSelectedSite(newSite);
        }}
      />

      {/* 7. Configure Destinations Modal */}
      {configuringSite && (
        <ConfigureDestinationsModal
          isOpen={configuringSite !== null}
          site={configuringSite}
          onClose={() => setConfiguringSite(null)}
          onSuccess={async (updated) => {
            setConfiguringSite(null);
            await refreshData();
            setSelectedSite(updated);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone Memoized AddSiteModal (Stable Input Identities)
// ---------------------------------------------------------------------------
interface AddSiteModalProps {
  isOpen: boolean;
  partners: Partner[];
  onClose: () => void;
  onSuccess: (newSite: Site) => void;
}

const AddSiteModal = memo(function AddSiteModal({
  isOpen,
  partners,
  onClose,
  onSuccess
}: AddSiteModalProps) {
  const [partnerId, setPartnerId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const resetForm = useCallback(() => {
    setPartnerId("");
    setSiteName("");
    setWebsiteUrl("");
    setTrackingCode("");
    setFormError("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!partnerId) {
      setFormError("Please select a Partner Owner.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          siteName: siteName.trim(),
          websiteUrl: websiteUrl.trim(),
          trackingCode: trackingCode.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to register website.");
      }

      resetForm();
      onSuccess(data.site);
    } catch (err: any) {
      setFormError(err.message || "Failed to register website.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Register Referral Website"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        {formError && <ErrorBanner message={formError} />}

        <div className="p-3 bg-surface-subtle border border-divider-soft rounded-lg text-secondary space-y-1">
          <p className="font-semibold text-primary">Referral Website Registration</p>
          <p className="text-[11px] leading-relaxed">
            Registers a referral website, associates the partner owner, and assigns a unique tracking identity. Property booking destinations can be linked immediately or configured later.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Select Partner Owner *</label>
          <select
            required
            value={partnerId}
            onChange={e => setPartnerId(e.target.value)}
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
          >
            <option value="">Select Partner...</option>
            {partners.map(p => (
              <option key={p.id} value={p.id}>{p.contactName} ({p.businessName || p.email})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Website Name *</label>
          <input
            type="text"
            required
            value={siteName}
            onChange={e => setSiteName(e.target.value)}
            placeholder="e.g. Megs Brass Direct"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Website Domain / URL *</label>
          <input
            type="text"
            required
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            placeholder="https://megsbrass.com"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Tracking Code *</label>
          <input
            type="text"
            required
            value={trackingCode}
            onChange={e => setTrackingCode(e.target.value)}
            placeholder="e.g. MEG-BRASS-01"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 uppercase font-mono"
          />
        </div>

        <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Registering..." : "Register Website"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
});

// ---------------------------------------------------------------------------
// Standalone ConfigureDestinationsModal (Hostaway direct booking URLs)
// ---------------------------------------------------------------------------
interface ConfigureDestinationsModalProps {
  isOpen: boolean;
  site: Site;
  onClose: () => void;
  onSuccess: (updatedSite: Site) => void;
}

const ConfigureDestinationsModal = memo(function ConfigureDestinationsModal({
  isOpen,
  site,
  onClose,
  onSuccess
}: ConfigureDestinationsModalProps) {
  const [selectedProps, setSelectedProps] = useState<Record<string, { enabled: boolean; bookingUrl: string }>>({});
  const [loadingHostaway, setLoadingHostaway] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Initialize from site
  useEffect(() => {
    const initial: Record<string, { enabled: boolean; bookingUrl: string }> = {};
    CORE_PROPERTIES.forEach(p => {
      const existing = (site.siteProperties || []).find(sp => sp.propertyId === p.id);
      initial[p.id] = {
        enabled: Boolean(existing),
        bookingUrl: existing?.customBookingUrl || ""
      };
    });
    setSelectedProps(initial);
  }, [site]);

  // One-click fetch verified Hostaway direct booking URLs
  const handleFetchHostaway = async () => {
    setLoadingHostaway(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sites/hostaway-booking-urls");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch Hostaway URLs");
      }

      const destinations: Array<{ propertyId: string; primaryBookingUrl: string | null }> = data.destinations || [];
      setSelectedProps(prev => {
        const next = { ...prev };
        destinations.forEach(d => {
          if (d.primaryBookingUrl && next[d.propertyId]) {
            next[d.propertyId] = {
              enabled: true,
              bookingUrl: d.primaryBookingUrl
            };
          }
        });
        return next;
      });
    } catch (err: any) {
      setError(err.message || "Failed to query Hostaway direct booking URLs.");
    } finally {
      setLoadingHostaway(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const mappings = Object.entries(selectedProps)
        .filter(([_, val]) => val.enabled && val.bookingUrl.trim())
        .map(([propertyId, val]) => ({
          propertyId,
          customBookingUrl: val.bookingUrl.trim()
        }));

      const res = await fetch("/api/admin/sites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          mappings
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update property mappings.");
      }

      onSuccess(data.site);
    } catch (err: any) {
      setError(err.message || "Failed to update property booking destinations.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Configure Property Booking Destinations"
    >
      <form onSubmit={handleSave} className="space-y-4 font-sans text-xs">
        {error && <ErrorBanner message={error} />}

        <div className="flex items-center justify-between p-3 bg-surface-subtle border border-divider-soft rounded-lg">
          <div>
            <p className="font-semibold text-primary">Hostaway Direct Booking URLs</p>
            <p className="text-[11px] text-secondary">
              Auto-query canonical listings 595515–595518 via secure API.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={handleFetchHostaway}
            disabled={loadingHostaway}
          >
            {loadingHostaway ? "Querying..." : "Auto-Fill Hostaway"}
          </Button>
        </div>

        <div className="space-y-3">
          {CORE_PROPERTIES.map(prop => {
            const current = selectedProps[prop.id] || { enabled: false, bookingUrl: "" };

            return (
              <div key={prop.id} className="p-3 bg-surface border border-divider rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={current.enabled}
                      onChange={e => {
                        const checked = e.target.checked;
                        setSelectedProps(prev => ({
                          ...prev,
                          [prop.id]: {
                            ...prev[prop.id],
                            enabled: checked
                          }
                        }));
                      }}
                      className="rounded border-divider-soft text-accent"
                    />
                    <span className="font-medium text-primary text-xs">{prop.name}</span>
                  </label>
                  <span className="text-[10px] text-tertiary font-mono">Hostaway #{prop.listingId}</span>
                </div>

                {current.enabled && (
                  <div>
                    <input
                      type="text"
                      value={current.bookingUrl}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedProps(prev => ({
                          ...prev,
                          [prop.id]: {
                            ...prev[prop.id],
                            bookingUrl: val
                          }
                        }));
                      }}
                      placeholder={`https://book.hiddenhoneyhomes.com/listings/${prop.listingId}`}
                      className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-md p-2 font-mono"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Destinations"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
});
