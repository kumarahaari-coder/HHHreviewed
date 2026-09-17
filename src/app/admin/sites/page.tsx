"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  MousePointerClick
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner } from "@/lib/db/schema";
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
  Dialog
} from "@/components/ui";
import { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";

const CORE_PROPERTIES = [
  { id: "38d9159e-a35d-405e-826e-7381ad3c3197", name: "Uptown St. Augustine" },
  { id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768", name: "Downtown St. Augustine (Lincoln)" },
  { id: "51be6158-268d-4c96-8f0b-9968f544ddfa", name: "Ellsworth, Maine" },
  { id: "55791a54-b1a3-459e-bbd5-9073a418b774", name: "Beech Mountain, NC" }
];

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

  // Form & Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [siteName, setSiteName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

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
        } else {
          setSites(db.sites);
        }
      } else {
        setSites(db.sites);
      }

      if (partnersRes && partnersRes.ok) {
        const pData = await partnersRes.json();
        if (pData.success && Array.isArray(pData.partners)) {
          setPartners(pData.partners);
        } else {
          setPartners(db.partners);
        }
      } else {
        setPartners(db.partners);
      }
    } catch {
      setSites(db.sites);
      setPartners(db.partners);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleCopy = (path: string) => {
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(path);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleAddSite = async (e: React.FormEvent) => {
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

      setShowAddDialog(false);
      setSiteName("");
      setWebsiteUrl("");
      setTrackingCode("");
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || "Failed to register website.");
    } finally {
      setSubmitting(false);
    }
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
              <option value="ALL">All Mapping States</option>
              <option value="ACTIVE">Mapped & Active</option>
              <option value="UNMAPPED">Unmapped</option>
              <option value="REVIEW_REQUIRED">Review Required</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 3. Desktop Operational Table (>=768px) */}
      <div className="hidden md:block font-sans">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Website Name & Domain</TableHead>
                <TableHead>Partner Owner</TableHead>
                <TableHead>OwnerRez Source</TableHead>
                <TableHead align="center">Source Mapping State</TableHead>
                <TableHead align="center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12">
                    <EmptyState
                      title="No referral sites found"
                      description="No registered website records match your active search query."
                      action={
                        <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(""); setSelectedStatus("ALL"); }}>
                          Reset Search
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredSites.map(s => {
                  const partner = partners.find(p => p.id === s.partnerId);
                  const isMapped = Boolean(s.status === "ACTIVE" && s.partnerId);
                  const displayName = s.siteName === "Haari tEst" ? "Megbrass Referral Site" : s.siteName;

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

                      {/* Column 3: OwnerRez Source Name & Diagnostic Code */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-primary">
                            {s.ownerrezListingSiteName || "OwnerRez Ingestion"}
                          </div>
                          <div className="text-[10px] text-tertiary font-mono">
                            Diagnostic Ref: {s.trackingCode}
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 4: Mapping State */}
                      <TableCell align="center">
                        <StatusBadge variant={isMapped ? "success" : "warning"}>
                          {isMapped ? "Mapped" : "Unmapped"}
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
            return (
              <TableMobileCard
                key={s.id}
                title={s.siteName}
                subtitle={s.websiteUrl ? s.websiteUrl.replace(/^https?:\/\//, "") : "No domain set"}
                badge={
                  <StatusBadge variant={s.status === "ACTIVE" ? "success" : "warning"}>
                    {s.status === "ACTIVE" ? "Mapped" : "Unmapped"}
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
                  <span className="text-xs font-medium text-secondary">Mapping Status:</span>
                  <StatusBadge variant={selectedSite.status === "ACTIVE" ? "success" : "warning"}>
                    {selectedSite.status === "ACTIVE" ? "Mapped" : "Unmapped"}
                  </StatusBadge>
                </div>
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

              {/* Unique Redirect Links Grid */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Property Referral Links
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-2">
                  {CORE_PROPERTIES.map(prop => {
                    const redirectPath = `/r/${selectedSite.id}/${prop.id}`;
                    const isCopied = copiedLink === redirectPath;

                    return (
                      <div key={prop.id} className="p-2.5 bg-surface-subtle border border-divider-soft rounded-md space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-primary">{prop.name}</span>
                          <Button
                            variant="tertiary"
                            size="sm"
                            icon={isCopied ? Check : Copy}
                            onClick={() => handleCopy(redirectPath)}
                          >
                            {isCopied ? "Copied" : "Copy Link"}
                          </Button>
                        </div>
                        <div className="text-[11px] font-mono text-secondary truncate">
                          {redirectPath}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* 6. Add Site Dialog */}
      <Dialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Register Referral Website"
      >
        <form onSubmit={handleAddSite} className="space-y-4 font-sans text-xs">
          {formError && <ErrorBanner message={formError} />}

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
            <label className="block text-xs font-medium text-secondary mb-1">Website Domain / URL</label>
            <input
              type="text"
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
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Registering..." : "Register Site"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
