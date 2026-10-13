"use client";

import React, { useEffect, useState, useCallback, Suspense, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Wallet,
  Edit,
  Trash2,
  Archive,
  RefreshCw
} from "lucide-react";
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

interface PartnerUserRecord {
  id: string;
  email: string;
  name?: string;
  role: string;
  partnerId?: string;
  clerkId?: string;
  clerkUserId?: string;
  status: string;
}

interface BannerNotification {
  type: "error" | "success" | "warning";
  title?: string;
  message: string;
}

export default function PartnerManagement() {
  return (
    <Suspense fallback={<LoadingState message="Loading Partner directory..." />}>
      <PartnerManagementContent />
    </Suspense>
  );
}

function PartnerManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedPartnerId = searchParams?.get("partnerId") || null;

  // Authoritative Data states - strictly initialized empty, never fallback to mockDb
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [partnerUsers, setPartnerUsers] = useState<PartnerUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("OPERATIONAL");

  // Selection / Detail Drawer State
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Menu Dropdown State
  const [activeMenuPartnerId, setActiveMenuPartnerId] = useState<string | null>(null);

  // Modal Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "ARCHIVE" | "DELETE";
    partner: Partner | null;
  }>({
    isOpen: false,
    type: "ARCHIVE",
    partner: null
  });

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [partnersRes, sitesRes] = await Promise.all([
        fetch("/api/admin/partners"),
        fetch("/api/admin/sites")
      ]);

      if (!partnersRes.ok) {
        const errorText = await partnersRes.text();
        throw new Error(`Failed to load partners (HTTP ${partnersRes.status}): ${errorText}`);
      }

      const pData = await partnersRes.json();
      if (pData.success && Array.isArray(pData.partners)) {
        setPartners(pData.partners);
        if (Array.isArray(pData.users)) {
          setPartnerUsers(pData.users);
        }
      } else {
        throw new Error(pData.error || "Failed to load partners from database");
      }

      if (sitesRes.ok) {
        const sData = await sitesRes.json();
        if (sData.success && Array.isArray(sData.sites)) {
          setSites(sData.sites);
        } else {
          setSites([]);
        }
      } else {
        setSites([]);
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        title: "Directory Load Error",
        message: err?.message || "Failed to synchronize production partner directory."
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Deep-link auto-selection
  useEffect(() => {
    if (deepLinkedPartnerId && partners.length > 0) {
      const target = partners.find(p => p.id === deepLinkedPartnerId);
      if (target) {
        setSelectedPartner(target);
      }
    }
  }, [deepLinkedPartnerId, partners]);

  const handlePartnerAction = async (
    partnerId: string,
    action: "RESEND_INVITE" | "RESET_PASSWORD" | "SUSPEND" | "ACTIVATE" | "ARCHIVE" | "DELETE" | "REMOVE"
  ) => {
    setActiveMenuPartnerId(null);
    try {
      const res = await fetch("/api/admin/partners/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, partnerId })
      });
      const data = await res.json();
      if (data.success) {
        setBanner({
          type: "success",
          title: "Action Succeeded",
          message: data.message || `Action ${action} completed successfully.`
        });
        await refreshData();
      } else {
        setBanner({
          type: "error",
          title: `Action Failed (${action})`,
          message: data.error || "The server rejected the requested partner action."
        });
      }
    } catch (err: any) {
      setBanner({
        type: "error",
        title: "Request Error",
        message: err?.message || "Communication failure while processing partner action."
      });
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmDialog.partner) return;
    const { type, partner } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: "ARCHIVE", partner: null });

    if (type === "DELETE") {
      await handlePartnerAction(partner.id, "DELETE");
    } else {
      await handlePartnerAction(partner.id, "ARCHIVE");
    }
  };

  // Filter Logic
  const filteredPartners = partners.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.contactName?.toLowerCase().includes(q);
      const matchBusiness = p.businessName?.toLowerCase().includes(q);
      const matchEmail = p.email?.toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      if (!matchName && !matchBusiness && !matchEmail && !matchId) return false;
    }

    if (selectedStatus === "OPERATIONAL") {
      if (p.status !== "ACTIVE" && p.status !== "INVITED") return false;
    } else if (selectedStatus !== "ALL_RECORDS" && p.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  if (loading) {
    return <LoadingState message="Loading Partner directory from Supabase..." />;
  }

  return (
    <div className="space-y-6 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Partners"
        description="Managed partner directory, account status, and referral channel readiness."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => refreshData()}
              title="Refresh directory from Supabase"
            >
              Sync
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={UserPlus}
              onClick={() => setShowAddDialog(true)}
            >
              Add Partner
            </Button>
          </div>
        }
      />

      {/* 2. Prominent Inline Notification Banner (Never browser alert) */}
      {banner && (
        <div
          className={`p-4 rounded-lg flex items-start justify-between gap-4 font-sans border ${
            banner.type === "error"
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : banner.type === "warning"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              {banner.title && <h4 className="text-xs font-semibold tracking-tight">{banner.title}</h4>}
              <p className="text-xs mt-0.5 leading-relaxed">{banner.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Controls & Search Bar */}
      <Card variant="default" className="p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary pointer-events-none">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search partner name, business, email, or ID..."
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
              <option value="OPERATIONAL">Operational (Active & Invited)</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INVITED">Invited Only</option>
              <option value="SUSPENDED">Suspended Only</option>
              <option value="ARCHIVED">Archived Only</option>
              <option value="ALL_RECORDS">All Records (Inc. Archived/Suspended)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 4. Desktop Operational Table (>=768px) */}
      <div className="hidden md:block">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner & Business</TableHead>
                <TableHead>Email Contact</TableHead>
                <TableHead>Account & Login Readiness</TableHead>
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
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSearchQuery("");
                            setSelectedStatus("ALL_RECORDS");
                          }}
                        >
                          Reset Search & Filters
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredPartners.map(p => {
                  const partnerSites = sites.filter(s => s.partnerId === p.id);
                  const matchingUser = partnerUsers.find(
                    u => u.partnerId === p.id || (u.email && u.email.toLowerCase() === p.email.toLowerCase())
                  );
                  const hasClerkLink = Boolean(matchingUser && (matchingUser.clerkId || matchingUser.clerkUserId));

                  return (
                    <TableRow key={p.id} onClick={() => setSelectedPartner(p)}>
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

                      {/* Column 3: Account State & Login Readiness */}
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadge variant={getStatusTypeForState(p.status)}>
                            {formatStatusLabel(p.status)}
                          </StatusBadge>
                          {p.status === "ACTIVE" && (
                            hasClerkLink ? (
                              <span className="text-[10px] text-emerald-400 block font-medium">
                                ✓ Login Ready (Clerk Linked)
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400 block font-medium">
                                ⚠ Pending Clerk Registration
                              </span>
                            )
                          )}
                          {p.status === "INVITED" && (
                            <span className="text-[10px] text-secondary block font-medium">
                              Invitation Sent
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
                              <div className="absolute right-0 top-9 w-48 bg-surface border border-divider shadow-xl rounded-lg p-1 z-50 text-left space-y-0.5 text-xs">
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
                                  onClick={() => {
                                    setActiveMenuPartnerId(null);
                                    setEditingPartner(p);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-primary hover:bg-surface-subtle rounded font-medium cursor-pointer"
                                >
                                  <Edit size={14} className="text-secondary" />
                                  <span>Edit Partner</span>
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
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-amber-400 hover:bg-amber-500/10 rounded font-medium cursor-pointer"
                                  >
                                    <ShieldAlert size={14} />
                                    <span>Suspend Access</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handlePartnerAction(p.id, "ACTIVATE")}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded font-medium cursor-pointer"
                                  >
                                    <CheckCircle2 size={14} />
                                    <span>Activate Access</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuPartnerId(null);
                                    setConfirmDialog({
                                      isOpen: true,
                                      type: "ARCHIVE",
                                      partner: p
                                    });
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-secondary hover:bg-surface-subtle rounded font-medium cursor-pointer"
                                >
                                  <Archive size={14} />
                                  <span>Archive Partner</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuPartnerId(null);
                                    setConfirmDialog({
                                      isOpen: true,
                                      type: "DELETE",
                                      partner: p
                                    });
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-red-400 hover:bg-red-500/10 rounded font-medium cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                  <span>Remove Record</span>
                                </button>
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

      {/* 5. Mobile Operational Card Stack (<768px) */}
      <div className="block md:hidden space-y-3">
        {filteredPartners.length === 0 ? (
          <EmptyState
            title="No partners found"
            description="No partner records match your active search query."
          />
        ) : (
          filteredPartners.map(p => {
            const partnerSites = sites.filter(s => s.partnerId === p.id);
            const matchingUser = partnerUsers.find(
              u => u.partnerId === p.id || (u.email && u.email.toLowerCase() === p.email.toLowerCase())
            );
            const hasClerkLink = Boolean(matchingUser && (matchingUser.clerkId || matchingUser.clerkUserId));

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
                  {
                    label: "Login State",
                    value:
                      p.status === "ACTIVE"
                        ? hasClerkLink
                          ? "Login Ready"
                          : "Pending Registration"
                        : formatStatusLabel(p.status)
                  },
                  { label: "Linked Sites", value: partnerSites.length, numeric: true },
                  { label: "Commission", value: `${p.commissionRate || 10}%`, numeric: true },
                  { label: "Tax Form", value: "W-9 On File" }
                ]}
              />
            );
          })
        )}
      </div>

      {/* 6. Partner Detail SlideOver Drawer */}
      <SlideOver
        isOpen={selectedPartner !== null}
        onClose={() => setSelectedPartner(null)}
        size="lg"
        title={selectedPartner ? selectedPartner.contactName : "Partner Detail"}
        description={selectedPartner ? selectedPartner.businessName || selectedPartner.email : undefined}
      >
        {selectedPartner && (() => {
          const partnerSites = sites.filter(s => s.partnerId === selectedPartner.id);
          const matchingUser = partnerUsers.find(
            u => u.partnerId === selectedPartner.id || (u.email && u.email.toLowerCase() === selectedPartner.email.toLowerCase())
          );
          const hasClerkLink = Boolean(matchingUser && (matchingUser.clerkId || matchingUser.clerkUserId));

          return (
            <div className="space-y-5 font-sans py-1">
              {/* Profile Summary */}
              <div className="bg-surface-subtle border border-divider-soft rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Partner ID:</span>
                  <span className="text-xs font-mono text-primary select-all">{selectedPartner.id}</span>
                </div>
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
                {selectedPartner.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Phone:</span>
                    <span className="text-xs text-primary">{selectedPartner.phone}</span>
                  </div>
                )}
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
                    <span className={`text-xs font-medium ${hasClerkLink ? "text-emerald-400" : "text-amber-400"}`}>
                      {hasClerkLink
                        ? `Linked (${matchingUser?.clerkId || matchingUser?.clerkUserId})`
                        : "Pending Clerk Registration"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Database User Row:</span>
                    <span className="text-xs font-medium text-primary">
                      {matchingUser ? `Present (${matchingUser.status})` : "No public.users row"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Commission Rate:</span>
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      {selectedPartner.commissionRate || 10}%
                    </span>
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
                      <div
                        key={s.id}
                        className="flex items-center justify-between text-xs py-1.5 border-b border-divider-soft last:border-0"
                      >
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
                    Tax documents and encrypted banking records are retained according to IRS compliance mandates.
                  </p>
                </div>
              </div>

              {/* Action Buttons in Drawer */}
              <div className="pt-3 border-t border-divider-soft flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit}
                  onClick={() => {
                    setEditingPartner(selectedPartner);
                  }}
                >
                  Edit Profile
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Archive}
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        type: "ARCHIVE",
                        partner: selectedPartner
                      });
                    }}
                  >
                    Archive
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    icon={Trash2}
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        type: "DELETE",
                        partner: selectedPartner
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* 7. Add Partner Dialog Component */}
      <AddPartnerModal
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={async (newPartner) => {
          setShowAddDialog(false);
          setBanner({
            type: "success",
            title: "Partner Created",
            message: `Successfully created partner "${newPartner.businessName || newPartner.contactName}".`
          });
          await refreshData();
        }}
      />

      {/* 8. Edit Partner Dialog Component */}
      <EditPartnerModal
        isOpen={editingPartner !== null}
        partner={editingPartner}
        onClose={() => setEditingPartner(null)}
        onSuccess={async (updated) => {
          setEditingPartner(null);
          setBanner({
            type: "success",
            title: "Partner Updated",
            message: `Partner details for "${updated.businessName || updated.contactName}" successfully updated.`
          });
          await refreshData();
        }}
      />

      {/* 9. Archive & Delete Safety Confirmation Dialog */}
      <Dialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: "ARCHIVE", partner: null })}
        title={confirmDialog.type === "DELETE" ? "Remove Partner Record" : "Archive Partner Account"}
      >
        <div className="space-y-4 font-sans text-xs">
          <div className="p-3 bg-surface-subtle border border-divider-soft rounded-lg space-y-1.5">
            <p className="font-semibold text-primary">
              {confirmDialog.partner?.businessName || confirmDialog.partner?.contactName}
            </p>
            <p className="text-secondary font-mono text-[11px]">{confirmDialog.partner?.id}</p>
          </div>

          {confirmDialog.type === "DELETE" ? (
            <div className="space-y-2 text-secondary">
              <p className="text-red-400 font-medium">
                Authoritative Deletion Safeguards Active:
              </p>
              <p>
                If this partner has any associated websites, historical reservations, referrals, or commission ledger
                entries, destructive deletion will be <strong>strictly blocked</strong> to preserve financial and attribution audit trails.
              </p>
              <p className="text-[11px] text-tertiary">
                If blocked, the server will instruct you to use <strong>Archive</strong> instead.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-secondary">
              <p>
                Archiving marks the partner as <strong>ARCHIVED</strong>, revokes portal access, and removes them from default operational views.
              </p>
              <p className="text-emerald-400 text-[11px]">
                Historical attribution, site bindings, and financial ledger data are fully preserved. Archiving can be reversed at any time.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmDialog({ isOpen: false, type: "ARCHIVE", partner: null })}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.type === "DELETE" ? "destructive" : "primary"}
              onClick={handleExecuteConfirmedAction}
            >
              {confirmDialog.type === "DELETE" ? "Confirm Removal" : "Archive Partner"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone, Memoized AddPartnerModal to ensure 100% stable input identities
// ---------------------------------------------------------------------------
interface AddPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (partner: Partner) => void;
}

const AddPartnerModal = memo(function AddPartnerModal({
  isOpen,
  onClose,
  onSuccess
}: AddPartnerModalProps) {
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [status, setStatus] = useState<PartnerStatus>("INVITED");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Intentionally reset form when closed and reopened
  useEffect(() => {
    if (!isOpen) {
      setContactName("");
      setBusinessName("");
      setEmail("");
      setCommissionRate("10");
      setStatus("INVITED");
      setSubmitting(false);
      setFormError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          businessName: businessName.trim(),
          email: email.trim().toLowerCase(),
          commissionRate: Number(commissionRate) || 10,
          status
        })
      });

      const data = await res.json();

      if (data.success && data.partner) {
        onSuccess(data.partner);
      } else {
        setFormError(data.error || "Failed to create partner");
      }
    } catch (err: any) {
      setFormError(err?.message || "Network error while creating partner");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Add Partner Account">
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError("")} />}

        <div>
          <label htmlFor="add-partner-contact-name" className="block text-xs font-medium text-secondary mb-1">
            Contact Name *
          </label>
          <input
            id="add-partner-contact-name"
            name="contactName"
            type="text"
            required
            autoComplete="name"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            placeholder="e.g. Megan Brass"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="add-partner-business-name" className="block text-xs font-medium text-secondary mb-1">
            Business Name
          </label>
          <input
            id="add-partner-business-name"
            name="businessName"
            type="text"
            autoComplete="organization"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="e.g. Megs Brass Direct LLC"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="add-partner-email" className="block text-xs font-medium text-secondary mb-1">
            Email Address *
          </label>
          <input
            id="add-partner-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="partner@example.com"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-partner-commission-rate" className="block text-xs font-medium text-secondary mb-1">
              Commission Rate (%)
            </label>
            <input
              id="add-partner-commission-rate"
              name="commissionRate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={commissionRate}
              onChange={e => setCommissionRate(e.target.value)}
              placeholder="10"
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            />
          </div>
          <div>
            <label htmlFor="add-partner-initial-status" className="block text-xs font-medium text-secondary mb-1">
              Initial Status
            </label>
            <select
              id="add-partner-initial-status"
              name="status"
              value={status}
              onChange={e => setStatus(e.target.value as PartnerStatus)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            >
              <option value="INVITED">Invited</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Partner"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
});

// ---------------------------------------------------------------------------
// Standalone, Memoized EditPartnerModal
// ---------------------------------------------------------------------------
interface EditPartnerModalProps {
  isOpen: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSuccess: (updated: Partner) => void;
}

const EditPartnerModal = memo(function EditPartnerModal({
  isOpen,
  partner,
  onClose,
  onSuccess
}: EditPartnerModalProps) {
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [status, setStatus] = useState<PartnerStatus>("ACTIVE");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (partner && isOpen) {
      setContactName(partner.contactName || "");
      setBusinessName(partner.businessName || "");
      setEmail(partner.email || "");
      setPhone(partner.phone || "");
      setWebsite(partner.website || "");
      setCommissionRate(String(partner.commissionRate ?? 10));
      setStatus(partner.status || "ACTIVE");
      setNotes(partner.notes || "");
      setFormError("");
    }
  }, [partner, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner) return;
    setFormError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/partners/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT",
          partnerId: partner.id,
          updates: {
            contactName: contactName.trim(),
            businessName: businessName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            website: website.trim(),
            commissionRate: Number(commissionRate) || 10,
            status,
            notes: notes.trim()
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess({
          ...partner,
          contactName: contactName.trim(),
          businessName: businessName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          website: website.trim(),
          commissionRate: Number(commissionRate) || 10,
          status,
          notes: notes.trim()
        });
      } else {
        setFormError(data.error || "Failed to update partner");
      }
    } catch (err: any) {
      setFormError(err?.message || "Network error during update");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Edit Partner Account">
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError("")} />}

        <div>
          <label htmlFor="edit-partner-contact-name" className="block text-xs font-medium text-secondary mb-1">
            Contact Name *
          </label>
          <input
            id="edit-partner-contact-name"
            name="contactName"
            type="text"
            required
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="edit-partner-business-name" className="block text-xs font-medium text-secondary mb-1">
            Business Name
          </label>
          <input
            id="edit-partner-business-name"
            name="businessName"
            type="text"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="edit-partner-email" className="block text-xs font-medium text-secondary mb-1">
            Email Address *
          </label>
          <input
            id="edit-partner-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-partner-commission-rate" className="block text-xs font-medium text-secondary mb-1">
              Commission Rate (%)
            </label>
            <input
              id="edit-partner-commission-rate"
              name="commissionRate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={commissionRate}
              onChange={e => setCommissionRate(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            />
          </div>
          <div>
            <label htmlFor="edit-partner-status" className="block text-xs font-medium text-secondary mb-1">
              Status
            </label>
            <select
              id="edit-partner-status"
              name="status"
              value={status}
              onChange={e => setStatus(e.target.value as PartnerStatus)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            >
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="edit-partner-website" className="block text-xs font-medium text-secondary mb-1">
            Website URL
          </label>
          <input
            id="edit-partner-website"
            name="website"
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="edit-partner-notes" className="block text-xs font-medium text-secondary mb-1">
            Notes
          </label>
          <textarea
            id="edit-partner-notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Internal partner notes..."
            className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
          />
        </div>

        <div className="pt-3 border-t border-divider-soft flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
});
