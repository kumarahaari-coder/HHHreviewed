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
  User
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Partner, CommissionRule } from "@/lib/db/schema";
import { Card, Badge, Dialog } from "@/components/ui/custom";

export default function PartnerManagement() {
  const router = useRouter();
  
  // Data states
  const [partners, setPartners] = useState<Partner[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  
  // Dialog / Form states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // New Partner Form
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<Partner["paymentMethod"]>("BANK_TRANSFER");
  const [payoutFrequency, setPayoutFrequency] = useState<Partner["payoutFrequency"]>("MONTHLY");
  const [notes, setNotes] = useState("");

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  const refreshData = () => {
    setPartners([...db.partners]);
    setRules(db.commissionRules);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleAddPartner = (e: React.FormEvent) => {
    e.preventDefault();
    const newPartner = db.addPartner({
      businessName,
      contactName,
      email,
      phone,
      paymentMethod,
      currency: "USD",
      payoutFrequency,
      status: "ACTIVE",
      notes
    });

    // Also auto-create a mock user for this partner so they can be simulated/impersonated
    const list = db.users;
    db.users = [
      ...list,
      {
        id: `user-partner-${newPartner.id}`,
        name: contactName,
        email: email,
        role: "PARTNER_OWNER",
        partnerId: newPartner.id,
        status: "ACTIVE",
        createdAt: new Date().toISOString().split("T")[0]
      }
    ];

    refreshData();
    setShowAddDialog(false);
    
    // Reset fields
    setBusinessName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setNotes("");

    db.addNotification("SUCCESS", `Partner "${businessName}" created and partner portal user activated.`);
  };

  const handleToggleStatus = (id: string, currentStatus: Partner["status"]) => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    db.updatePartner(id, { status: newStatus });
    
    // Also toggle matching users
    db.users = db.users.map(u => u.partnerId === id ? { ...u, status: newStatus === "ACTIVE" ? "ACTIVE" : "SUSPENDED" } : u);

    refreshData();
    db.addNotification("WARNING", `Partner status updated to ${newStatus} for partner ID ${id}.`);
  };

  const handleImpersonate = (partner: Partner) => {
    // Find corresponding partner user
    const pUser = db.users.find(u => u.partnerId === partner.id);
    if (pUser) {
      db.currentUser = pUser;
      db.addNotification("INFO", `Impersonating Partner: ${partner.contactName} (${partner.businessName}).`);
      router.push("/partner");
    } else {
      // Create user on the fly if missing
      const newUser = {
        id: `user-partner-${partner.id}`,
        name: partner.contactName,
        email: partner.email,
        role: "PARTNER_OWNER" as const,
        partnerId: partner.id,
        status: "ACTIVE" as const,
        createdAt: new Date().toISOString().split("T")[0]
      };
      db.users = [...db.users, newUser];
      db.currentUser = newUser;
      router.push("/partner");
    }
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSent(true);
    setTimeout(() => {
      setInviteSent(false);
      setShowInviteDialog(false);
      setInviteEmail("");
      db.addNotification("SUCCESS", `Invitation email sent successfully to ${inviteEmail}.`);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Partner Management</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Register and manage website owners, edit commissions, and invite users.
          </p>
        </div>

        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center space-x-1.5 bg-brand-plum text-brand-cream hover:bg-brand-wine px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 self-end sm:self-auto"
        >
          <Plus size={16} />
          <span>Add Partner</span>
        </button>
      </div>

      {/* PARTNER LIST GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {partners.map(partner => {
          const partnerSites = db.sites.filter(s => s.partnerId === partner.id);
          
          return (
            <Card key={partner.id} className="flex flex-col justify-between h-full relative overflow-hidden">
              {/* Partner ID top tag */}
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{partner.id}</span>
                <Badge type={partner.status === "ACTIVE" ? "success" : "danger"}>
                  {partner.status}
                </Badge>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-brand-plum truncate">{partner.businessName}</h3>
                <div className="flex items-center space-x-2 text-xs text-zinc-600">
                  <User size={12} className="text-zinc-400 shrink-0" />
                  <span className="font-semibold">{partner.contactName}</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-zinc-500">
                  <Mail size={12} className="text-zinc-400 shrink-0" />
                  <span className="truncate">{partner.email}</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-zinc-500">
                  <Phone size={12} className="text-zinc-400 shrink-0" />
                  <span>{partner.phone}</span>
                </div>
              </div>

              {/* Connected websites summary */}
              <div className="mt-4 pt-4 border-t border-brand-blush/60 space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-brand-wine">
                  <Building size={12} />
                  <span>Referred Websites ({partnerSites.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {partnerSites.length === 0 ? (
                    <span className="text-[10px] text-zinc-400 italic">No websites assigned</span>
                  ) : (
                    partnerSites.map(s => (
                      <span key={s.id} className="text-[10px] bg-brand-blush/30 px-2 py-0.5 rounded text-zinc-600 border border-brand-blush/50">
                        {s.siteName}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Notes */}
              {partner.notes && (
                <p className="mt-4 text-xs text-zinc-400 italic bg-brand-bg/40 p-2.5 rounded border border-brand-blush/30">
                  "{partner.notes}"
                </p>
              )}

              {/* Actions Footer */}
              <div className="mt-6 pt-4 border-t border-brand-blush/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleImpersonate(partner)}
                  className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-brand-blush hover:bg-brand-blush/80 text-brand-plum border border-brand-blush/60 rounded-lg text-xs font-bold transition-colors"
                >
                  <Eye size={12} />
                  <span>View As Partner</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedPartner(partner);
                    setInviteEmail(partner.email);
                    setShowInviteDialog(true);
                  }}
                  className="p-1.5 text-zinc-500 hover:text-brand-plum hover:bg-brand-blush/40 rounded-lg transition-colors border border-transparent hover:border-brand-blush"
                  title="Invite portal user"
                >
                  <UserPlus size={14} />
                </button>

                <button
                  onClick={() => handleToggleStatus(partner.id, partner.status)}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    partner.status === "ACTIVE"
                      ? "text-rose-600 border-rose-100 hover:bg-rose-50"
                      : "text-emerald-600 border-emerald-100 hover:bg-emerald-50"
                  }`}
                  title={partner.status === "ACTIVE" ? "Suspend partner access" : "Activate partner access"}
                >
                  {partner.status === "ACTIVE" ? <Ban size={14} /> : <UserCheck size={14} />}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* DIALOG: ADD NEW PARTNER */}
      <Dialog isOpen={showAddDialog} onClose={() => setShowAddDialog(false)} title="Register Partner Profile">
        <form onSubmit={handleAddPartner} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Business Name</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Partner Website Network"
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none focus:border-brand-plum"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Contact Name</label>
              <input
                type="text"
                required
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="e.g. Partner Contact"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none focus:border-brand-plum"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="555-0123"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none focus:border-brand-plum"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Email Address (User Login)</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@partner.com"
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none focus:border-brand-plum"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2 px-2.5 focus:outline-none"
              >
                <option value="BANK_TRANSFER">Bank Transfer (ACH)</option>
                <option value="WISE">Wise Transfer</option>
                <option value="STRIPE">Stripe Connect</option>
                <option value="PAYPAL">PayPal</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Payout Frequency</label>
              <select
                value={payoutFrequency}
                onChange={e => setPayoutFrequency(e.target.value as any)}
                className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2 px-2.5 focus:outline-none"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="BI_WEEKLY">Bi-Weekly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Internal Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add partner context here..."
              rows={3}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none focus:border-brand-plum"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg text-xs font-bold transition-all shadow-md mt-4"
          >
            Create Partner Profile
          </button>
        </form>
      </Dialog>

      {/* DIALOG: INVITE USER */}
      <Dialog isOpen={showInviteDialog} onClose={() => setShowInviteDialog(false)} title="Invite Partner Administrator">
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div className="p-3 bg-brand-blush/25 border border-brand-blush rounded-lg text-xs text-brand-wine leading-relaxed">
            Invite a new dashboard administrator for <span className="font-bold">{selectedPartner?.businessName}</span>. They will receive an email to setup password access.
          </div>
          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Email Address</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={inviteSent}
            className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg text-xs font-bold transition-all shadow-md"
          >
            {inviteSent ? "Sending Invitation..." : "Send Invitation"}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
