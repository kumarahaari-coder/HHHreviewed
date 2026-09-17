"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Search,
  Eye,
  Globe,
  MoreVertical,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Building2,
  Mail,
  User,
  X,
  FileCheck,
  AlertCircle,
  TrendingUp,
  Wallet
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Partner, PartnerStatus, TaxDocumentType } from "@/lib/db/schema";
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

export default function PartnerManagement() {
  const router = useRouter();

  // Data states
  const [partners, setPartners] = useState<Partner[]>(db.partners || []);
  const [sites, setSites] = useState<any[]>(db.sites || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Selection / Detail Drawer State
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Modal / Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeMenuPartnerId, setActiveMenuPartnerId] = useState<string | null>(null);

  // "Add Partner" Form State
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [taxDocumentCategory, setTaxDocumentCategory] = useState<TaxDocumentType>("W_9");
  const [commissionRate, setCommissionRate] = useState("10");
  const [status, setStatus] = useState<PartnerStatus>("INVITED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const refreshData = useCallback(async () => {
    try {
      setError(null);
      const [pRes, sRes] = await Promise.all([
        fetch("/api/admin/partners").catch(() => null),
        fetch("/api/admin/sites").catch(() => null)
      ]);

      if (pRes && pRes.ok) {
        const pData = await pRes.json();
        if (pData.success && Array.isArray(pData.partners)) {
          setPartners(pData.partners);
        } else {
          setPartners(db.partners);
        }
      } else {
        setPartners(db.partners);
      }

      if (sRes && sRes.ok) {
        const sData = await sRes.json();
        if (sData.success && Array.isArray(sData.sites)) {
          setSites(sData.sites);
        } else {
          setSites(db.sites);
        }
      } else {
        setSites(db.sites);
      }
    } catch {
      setPartners(db.partners);
      setSites(db.sites);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName,
          businessName,
          email,
          phone,
          website,
          taxDocumentCategory,
          commissionRate: Number(commissionRate) || 10,
          status,
          notes
        })
      });

      const data = await res.json();

      if (data.success) {
        setShowAddDialog(false);
        setContactName("");
        setBusinessName("");
        setEmail("");
        setPhone("");
        setWebsite("");
        setCommissionRate("10");
        setStatus("INVITED");
        setNotes("");

        await refreshData();
      } else {
        setFormError(data.error || "Failed to create partner");
      }
    } catch (err: any) {
      setFormError(err?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePartnerAction = async (partnerId: string, action: "RESEND_INVITE" | "RESET_PASSWORD" | "SUSPEND" | "ACTIVATE" | "ARCHIVE") => {
    setActiveMenuPartnerId(null);
    try {
      const res = await fetch("/api/admin/partners/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, partnerId })
      });
      const data = await res.json();
      if (data.success) {
        await refreshData();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err: any) {
      alert(err?.message || "Action request failed");
    }
  };

  // Filter Logic
  const filteredPartners = partners.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.contactName?.toLowerCase().includes(q);
      const matchBusiness = p.businessName?.toLowerCase().includes(q);
      const matchEmail = p.email?.toLowerCase().includes(q);
      if (!matchName && !matchBusiness && !matchEmail) return false;
    }

    if (selectedStatus !== "ALL" && p.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  if (loading) {
    return <LoadingState message="Loading Partner directory..." />;
  }

  return (
    <div className="space-y-6 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Partners"
        description="Managed partner directory, account status, and referral channel readiness."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={UserPlus}
            onClick={() => setShowAddDialog(true)}
          >
            Add Partner
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
              placeholder="Search partner name, business, or email..."
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
              <option value="ALL">All Account States</option>
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 3. Desktop Operational Table (>=768px) */}
      <div className="hidden md:block">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner & Business</TableHead>
                <TableHead>Email Contact</TableHead>
                <TableHead>Account State</TableHead>
                <TableHead align="center">Linked Sites</TableHead>
                <TableHead align="right">Commission</TableHead>
                <TableHead align="center">Tax Readiness</TableHead>
                <TableHead align="center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPartners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12">
                    <EmptyState
                      title="No partners found"
                      description="No partner records match your active search query or status filter."
                      action={
                        <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(""); setSelectedStatus("ALL"); }}>
                          Reset Search & Filters
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredPartners.map(p => {
                  const partnerSites = sites.filter(s => s.partnerId === p.id);
                  const matchingUser = db.users.find(u => u.partnerId === p.id || u.email.toLowerCase() === p.email.toLowerCase());
                  const hasClerkLink = Boolean(matchingUser);

                  return (
                    <TableRow
                      key={p.id}
                      onClick={() => setSelectedPartner(p)}
                    >
                      {/* Column 1: Business & Contact Name */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-primary">{p.contactName}</div>
                          <div className="text-[11px] text-secondary">{p.businessName || "Individual Partner"}</div>
                          {p.website && (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-tertiary hover:text-accent-hover flex items-center gap-1 mt-0.5"
                            >
                              <Globe size={10} />
                              <span className="truncate max-w-[160px]">{p.website.replace(/^https?:\/\//, "")}</span>
                            </a>
                          )}
                        </div>
                      </TableCell>

                      {/* Column 2: Email */}
                      <TableCell>
                        <div className="font-mono text-xs text-secondary">{p.email}</div>
                      </TableCell>

                      {/* Column 3: Account State */}
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadge variant={getStatusTypeForState(p.status)}>
                            {formatStatusLabel(p.status)}
                          </StatusBadge>
                          {!hasClerkLink && p.status === "ACTIVE" && (
                            <span className="text-[10px] text-warning block font-medium">
                              Pending Clerk Link
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Column 4: Sites Count */}
                      <TableCell align="center" numeric>
                        <span className="font-semibold text-primary">{partnerSites.length}</span>
                      </TableCell>

                      {/* Column 5: Rate */}
                      <TableCell align="right" numeric>
                        <span className="font-semibold text-primary">{p.commissionRate || 10}%</span>
                      </TableCell>

                      {/* Column 6: Tax Readiness */}
                      <TableCell align="center">
                        <StatusBadge variant="success">
                          W-9 On File
                        </StatusBadge>
                      </TableCell>

                      {/* Column 7: Actions Menu & Preview Trigger */}
                      <TableCell align="center">
                        <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="tertiary"
                            size="sm"
                            icon={Eye}
                            title="Preview Partner Portal"
                            onClick={() => router.push(`/partner?previewPartnerId=${encodeURIComponent(p.id)}`)}
                          />
                          <div className="relative">
                            <Button
                              variant="tertiary"
                              size="sm"
                              icon={MoreVertical}
                              onClick={() => setActiveMenuPartnerId(activeMenuPartnerId === p.id ? null : p.id)}
                            />

                            {activeMenuPartnerId === p.id && (
                              <div className="absolute right-0 top-9 w-44 bg-surface border border-divider shadow-lg rounded-lg p-1 z-50 text-left space-y-0.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuPartnerId(null);
                                    router.push(`/partner?previewPartnerId=${encodeURIComponent(p.id)}`);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-primary hover:bg-surface-subtle rounded font-medium cursor-pointer"
                                >
                                  <Eye size={14} className="text-secondary" />
                                  <span>Preview Portal</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePartnerAction(p.id, "RESEND_INVITE")}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-primary hover:bg-surface-subtle rounded font-medium cursor-pointer"
                                >
                                  <RotateCcw size={14} className="text-secondary" />
                                  <span>Resend Invite</span>
                                </button>
                                {p.status === "ACTIVE" ? (
                                  <button
                                    type="button"
                                    onClick={() => handlePartnerAction(p.id, "SUSPEND")}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-warning hover:bg-warning-surface rounded font-medium cursor-pointer"
                                  >
                                    <ShieldAlert size={14} />
                                    <span>Suspend Access</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handlePartnerAction(p.id, "ACTIVATE")}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-success hover:bg-success-surface rounded font-medium cursor-pointer"
                                  >
                                    <CheckCircle2 size={14} />
                                    <span>Activate Access</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
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
        {filteredPartners.length === 0 ? (
          <EmptyState
            title="No partners found"
            description="No partner records match your active search query."
          />
        ) : (
          filteredPartners.map(p => {
            const partnerSites = sites.filter(s => s.partnerId === p.id);
            return (
              <TableMobileCard
                key={p.id}
                title={p.contactName}
                subtitle={p.businessName || p.email}
                badge={
                  <StatusBadge variant={getStatusTypeForState(p.status)}>
                    {formatStatusLabel(p.status)}
                  </StatusBadge>
                }
                action={
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={Eye}
                    onClick={() => router.push(`/partner?previewPartnerId=${encodeURIComponent(p.id)}`)}
                  />
                }
                details={[
                  { label: "Email", value: p.email },
                  { label: "Linked Sites", value: partnerSites.length, numeric: true },
                  { label: "Commission", value: `${p.commissionRate || 10}%`, numeric: true },
                  { label: "Tax Form", value: "W-9 On File" }
                ]}
              />
            );
          })
        )}
      </div>

      {/* 5. Partner Detail SlideOver Drawer */}
      <SlideOver
        isOpen={selectedPartner !== null}
        onClose={() => setSelectedPartner(null)}
        size="lg"
        title={selectedPartner ? selectedPartner.contactName : "Partner Detail"}
        description={selectedPartner ? selectedPartner.businessName || selectedPartner.email : undefined}
      >
        {selectedPartner && (() => {
          const partnerSites = sites.filter(s => s.partnerId === selectedPartner.id);
          const matchingUser = db.users.find(u => u.partnerId === selectedPartner.id || u.email.toLowerCase() === selectedPartner.email.toLowerCase());

          return (
            <div className="space-y-5 font-sans py-1">
              {/* Profile Summary */}
              <div className="bg-surface-subtle border border-divider-soft rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Contact Name:</span>
                  <span className="text-xs font-semibold text-primary">{selectedPartner.contactName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Business Name:</span>
                  <span className="text-xs font-semibold text-primary">{selectedPartner.businessName || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Email:</span>
                  <span className="text-xs font-mono text-primary">{selectedPartner.email}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-divider-soft">
                  <span className="text-xs font-medium text-secondary">Account State:</span>
                  <StatusBadge variant={getStatusTypeForState(selectedPartner.status)}>
                    {formatStatusLabel(selectedPartner.status)}
                  </StatusBadge>
                </div>
              </div>

              {/* Access & User Identity */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  User & Identity State
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Clerk Identity Link:</span>
                    <span className="text-xs font-medium text-primary">
                      {matchingUser ? "Linked" : "Pending Clerk Registration"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Commission Rate:</span>
                    <span className="text-xs font-semibold text-primary tabular-nums">{selectedPartner.commissionRate || 10}%</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-divider-soft">
                    <span className="text-xs font-medium text-secondary">Admin Partner Preview:</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Eye}
                      onClick={() => {
                        setSelectedPartner(null);
                        router.push(`/partner?previewPartnerId=${encodeURIComponent(selectedPartner.id)}`);
                      }}
                    >
                      Open Portal Preview
                    </Button>
                  </div>
                </div>
              </div>

              {/* Linked Referral Sites */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Linked Websites & Referral Sources ({partnerSites.length})
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-2">
                  {partnerSites.length === 0 ? (
                    <p className="text-xs text-tertiary italic">No referral websites linked to this partner yet.</p>
                  ) : (
                    partnerSites.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-divider-soft last:border-0">
                        <div>
                          <p className="font-semibold text-primary">{s.siteName}</p>
                          <p className="text-[11px] text-secondary font-mono">{s.domain || "No domain set"}</p>
                        </div>
                        <StatusBadge variant={s.status === "ACTIVE" ? "success" : "neutral"}>
                          {formatStatusLabel(s.status || "ACTIVE")}
                        </StatusBadge>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Compliance & Tax Readiness */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Compliance & Tax Readiness
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Tax Form Category:</span>
                    <span className="text-xs font-semibold text-primary">W-9 (US Person / Entity)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Verification Status:</span>
                    <StatusBadge variant="success">Verified On File</StatusBadge>
                  </div>
                  <p className="text-[11px] text-tertiary">
                    Sensitive tax numbers (TIN/SSN) and banking details are encrypted and never exposed in UI.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* 6. Add Partner Dialog */}
      <Dialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Add Partner Account"
      >
        <form onSubmit={handleCreatePartner} className="space-y-4 font-sans text-xs">
          {formError && <ErrorBanner message={formError} />}

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Contact Name *</label>
            <input
              type="text"
              required
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="e.g. Megan Brass"
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Megs Brass Direct LLC"
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="partner@example.com"
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Commission Rate (%)</label>
              <input
                type="number"
                value={commissionRate}
                onChange={e => setCommissionRate(e.target.value)}
                placeholder="10"
                className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Initial Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as PartnerStatus)}
                className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
              >
                <option value="INVITED">Invited</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Partner"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
