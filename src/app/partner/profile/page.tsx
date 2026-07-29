"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Partner, User as UserType } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { User, Building, CreditCard, Mail, Phone } from "lucide-react";

export default function PartnerProfile() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    setCurrentUser(user);
    setPartner(db.partners.find(p => p.id === user.partnerId) || null);
  }, []);

  if (!partner || !currentUser) return null;

  return (
    <div className="space-y-6 font-sans max-w-2xl">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Profile Settings</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          View your profile details and billing configurations.
        </p>
      </div>

      <Card className="space-y-6">
        <div className="flex items-center space-x-4 border-b border-brand-blush/60 pb-4">
          <div className="w-12 h-12 rounded-full bg-brand-blush flex items-center justify-center text-brand-wine text-xl font-bold border border-brand-blush">
            {partner.contactName[0]}
          </div>
          <div>
            <h3 className="font-extrabold text-brand-plum text-lg">{partner.contactName}</h3>
            <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{partner.id}</span>
          </div>
        </div>

        <div className="space-y-4 text-sm text-zinc-700">
          <div className="flex items-center space-x-3">
            <Building size={16} className="text-zinc-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">Business Entity</span>
              <span className="font-semibold text-brand-plum">{partner.businessName}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Mail size={16} className="text-zinc-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">Email Address</span>
              <span className="font-semibold text-brand-plum">{partner.email}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Phone size={16} className="text-zinc-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">Contact Phone</span>
              <span className="font-semibold text-brand-plum">{partner.phone}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 border-t border-brand-blush/60 pt-4">
            <CreditCard size={16} className="text-zinc-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">Transfer Payout Method</span>
              <span className="font-semibold text-brand-plum uppercase">
                {partner.paymentMethod.replace("_", " ")} ({partner.payoutFrequency})
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
