"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Mail,
  UserCheck,
  Ban,
  Settings,
  Eye,
  Plus,
  BookOpen,
  Phone,
  Building,
  User,
  Globe,
  MoreVertical,
  RotateCcw,
  KeyRound,
  Trash2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Percent
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Partner, PartnerStatus, TaxDocumentType } from "@/lib/db/schema";
import { Card, Badge, Dialog } from "@/components/ui/custom";

export default function PartnerManagement() {
  const router = useRouter();

  // Data states
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);

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

  const refreshData = async () => {
    try {
      const res = await fetch("/api/admin/partners");
      const data = await res.json();
      if (data.success && data.partners) {
        setPartners(data.partners);
      } else {
        setPartners([...db.partners]);
      }
    } catch {
      setPartners([...db.partners]);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

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
        // Reset form
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

  const getStatusBadge = (partnerStatus: PartnerStatus) => {
    switch (partnerStatus) {
      case "INVITED":
        return <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200"><Clock size={11} /><span>Invited</span></span>;
      case "ACTIVE":
        return <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={11} /><span>Active</span></span>;
      case "SUSPENDED":
        return <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><ShieldAlert size={11} /><span>Suspended</span></span>;
      case "ARCHIVED":
        return <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"><Ban size={11} /><span>Archived</span></span>;
      default:
        return <Badge type="info">{partnerStatus}</Badge>;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header & Add Partner Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Partner & Creator Directory</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Create partners, send automatic Clerk & Brevo invitations, manage commission rates, and track onboarding status.
          </p>
        </div>

        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center space-x-2 bg-brand-plum text-brand-cream hover:bg-brand-wine px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 self-start sm:self-auto"
        >
          <UserPlus size={16} />
          <span>Add Partner</span>
        </button>
      </div>

      {/* PARTNERS TABLE LIST */}
      <Card className="overflow-hidden border border-brand-blush/80 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-blush text-[11px] font-bold uppercase tracking-wider text-brand-wine">
                <th className="py-3.5 px-4">Partner & Contact</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Last Login</th>
                <th className="py-3.5 px-4">Commission</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/40 text-sm">
              {partners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 font-serif italic">
                    No partners registered yet. Click "Add Partner" to create the first creator account.
                  </td>
                </tr>
              ) : (
                partners.map(p => {
                  const matchingUser = db.users.find(u => u.partnerId === p.id || u.email.toLowerCase() === p.email.toLowerCase());
                  const lastLoginDisplay = p.lastLogin || matchingUser?.lastLogin ? new Date(p.lastLogin || matchingUser?.lastLogin!).toLocaleDateString() : "—";
                  const commissionDisplay = `${p.commissionRate || 10}%`;

                  return (
                    <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                      {/* Partner & Contact */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-brand-plum">{p.contactName}</div>
                        <div className="text-xs text-zinc-500">{p.businessName}</div>
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noreferrer" className="text-[10px] text-brand-wine hover:underline flex items-center space-x-1 mt-0.5">
                            <Globe size={10} />
                            <span>{p.website.replace(/^https?:\/\//, "")}</span>
                          </a>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-4 px-4 text-zinc-600 font-mono text-xs">
                        {p.email}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        {getStatusBadge(p.status)}
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-4 text-xs text-zinc-500">
                        {lastLoginDisplay}
                      </td>

                      {/* Commission */}
                      <td className="py-4 px-4 font-bold text-brand-plum text-xs">
                        {commissionDisplay}
                      </td>

                      {/* Actions Menu */}
                      <td className="py-4 px-4 text-right relative">
                        <button
                          onClick={() => setActiveMenuPartnerId(activeMenuPartnerId === p.id ? null : p.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-brand-plum hover:bg-brand-blush/30 transition-colors"
                          title="Actions Menu"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuPartnerId === p.id && (
                          <div className="absolute right-4 top-12 w-48 bg-brand-cream border border-brand-blush shadow-xl rounded-xl p-1.5 z-50 text-left space-y-1 text-xs">
                            <button
                              onClick={() => {
                                setActiveMenuPartnerId(null);
                                router.push(`/partner?previewPartnerId=${encodeURIComponent(p.id)}`);
                              }}
                              className="w-full flex items-center space-x-2 px-3 py-2 text-brand-plum font-bold hover:bg-brand-blush/40 rounded-lg transition-colors"
                            >
                              <Eye size={14} className="text-brand-wine" />
                              <span>Preview Portal</span>
                            </button>

                            <button
                              onClick={() => handlePartnerAction(p.id, "RESEND_INVITE")}
                              className="w-full flex items-center space-x-2 px-3 py-2 text-zinc-700 hover:bg-brand-blush/30 hover:text-brand-plum rounded-lg transition-colors font-medium"
                            >
                              <RotateCcw size={14} className="text-purple-600" />
                              <span>Resend Invitation</span>
                            </button>

                            <button
                              onClick={() => handlePartnerAction(p.id, "RESET_PASSWORD")}
                              className="w-full flex items-center space-x-2 px-3 py-2 text-zinc-700 hover:bg-brand-blush/30 hover:text-brand-plum rounded-lg transition-colors font-medium"
                            >
                              <KeyRound size={14} className="text-blue-600" />
                              <span>Reset Password</span>
                            </button>

                            {p.status === "ACTIVE" ? (
                              <button
                                onClick={() => handlePartnerAction(p.id, "SUSPEND")}
                                className="w-full flex items-center space-x-2 px-3 py-2 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors font-medium"
                              >
                                <ShieldAlert size={14} />
                                <span>Suspend Access</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePartnerAction(p.id, "ACTIVATE")}
                                className="w-full flex items-center space-x-2 px-3 py-2 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors font-medium"
                              >
                                <CheckCircle2 size={14} />
                                <span>Activate Access</span>
                              </button>
                            )}

                            <button
                              onClick={() => handlePartnerAction(p.id, "ARCHIVE")}
                              className="w-full flex items-center space-x-2 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-lg transition-colors font-medium border-t border-brand-blush/60 mt-1 pt-1"
                            >
                              <Trash2 size={14} />
                              <span>Archive Partner</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ADD PARTNER DIALOG */}
      <Dialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Add New Partner & Issue Clerk Invitation"
      >
        <form onSubmit={handleCreatePartner} className="space-y-5">
          {formError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {formError}
            </div>
          )}

          {/* Section 1: Business Information */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-brand-wine font-bold border-b border-brand-blush pb-1">
              Business Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Partner Name *
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="e.g. Megan Brass"
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g. Megs Brass Connection"
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="partner@domain.com"
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="555-0192"
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Website URL (Optional)
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://megsbrass.com"
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Tax Info Form
                </label>
                <select
                  value={taxDocumentCategory}
                  onChange={e => setTaxDocumentCategory(e.target.value as TaxDocumentType)}
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
                >
                  <option value="W_9">W-9 (US Person / Business)</option>
                  <option value="W_8">W-8 (Foreign Creator)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Program Settings */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs uppercase tracking-widest text-brand-wine font-bold border-b border-brand-blush pb-1">
              Program Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Commission Rate (%)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400 text-xs font-bold">%</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={commissionRate}
                    onChange={e => setCommissionRate(e.target.value)}
                    className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum pr-8 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as PartnerStatus)}
                  className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum font-bold"
                >
                  <option value="INVITED">Invited (Send Onboarding Email)</option>
                  <option value="ACTIVE">Active (Immediate Portal Access)</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 mb-1">
                Internal Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Initial referral notes or campaign details..."
                className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-brand-blush flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setShowAddDialog(false)}
              className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-plum hover:bg-brand-wine text-brand-cream px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1.5"
            >
              <UserPlus size={14} />
              <span>{submitting ? "Creating & Inviting..." : "Create Partner"}</span>
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
