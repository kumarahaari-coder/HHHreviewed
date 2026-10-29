"use client";

import React, { useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

interface PublicAccount {
  accountHolderName: string;
  accountType: "CHECKING" | "SAVINGS";
  last4: string;
  verified: boolean;
}

const EMPTY = {
  accountHolderName: "",
  legalType: "PRIVATE",
  routingNumber: "",
  accountNumber: "",
  accountType: "CHECKING",
  street: "",
  city: "",
  state: "",
  zip: "",
};

const inputCls =
  "w-full bg-[#FFFFFF] border border-[#D2D2D7] rounded-lg px-3 py-2 text-xs text-[#1D1D1F] focus:outline-none focus:border-[#1D1D1F]";

export function PayoutAccountCard() {
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/partner/payout-account")
      .then(async (res) => {
        if (res.status === 403) {
          setAvailable(false); // e.g. an admin previewing a partner profile
          return;
        }
        const data = await res.json();
        if (data.success) setAccount(data.account);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/partner/payout-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHolderName: form.accountHolderName,
          legalType: form.legalType,
          routingNumber: form.routingNumber,
          accountNumber: form.accountNumber,
          accountType: form.accountType,
          address: { street: form.street, city: form.city, state: form.state, zip: form.zip },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessage({ type: "error", text: data.error || "Could not save payout details." });
      } else {
        setAccount(data.account);
        setForm(EMPTY); // clear the full account number from memory
        setEditing(false);
        setMessage({ type: "success", text: "Payout details saved. They will be confirmed by our team before your next payout." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (!available) return null;

  return (
    <Card className="space-y-4 p-6">
      <div className="flex justify-between items-center border-b border-[#E8E8ED] pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6E6E73] flex items-center gap-2">
          <CreditCard size={16} />
          Payout Account
        </h3>
        {loaded && account && (
          <StatusBadge variant={account.verified ? "success" : "warning"}>
            {account.verified ? "VERIFIED" : "PENDING VERIFICATION"}
          </StatusBadge>
        )}
        {loaded && !account && <StatusBadge variant="warning">NOT SET UP</StatusBadge>}
      </div>

      {message && (
        <div className={`text-xs p-3 rounded-lg border ${message.type === "success" ? "bg-[#F5F5F7] border-[#E8E8ED] text-[#1D1D1F]" : "bg-[#FFF5F5] border-[#F5C6C6] text-[#B42318]"}`}>
          {message.text}
        </div>
      )}

      {account && !editing && (
        <div className="flex justify-between items-center bg-[#F5F5F7] p-4 rounded-xl border border-[#E8E8ED]">
          <div className="flex items-center gap-3">
            {account.verified ? <ShieldCheck size={16} className="text-[#6E6E73]" /> : <Clock size={16} className="text-[#6E6E73]" />}
            <div>
              <p className="text-xs font-semibold text-[#1D1D1F]">
                {account.accountHolderName} · {account.accountType === "CHECKING" ? "Checking" : "Savings"} ••••{account.last4}
              </p>
              <p className="text-[11px] text-[#6E6E73] mt-0.5">Commission payouts are sent here by ACH.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setEditing(true); setMessage(null); }}
            className="text-xs font-medium text-[#1D1D1F] underline"
          >
            Change
          </button>
        </div>
      )}

      {(editing || (loaded && !account)) && (
        <form onSubmit={submit} className="space-y-3" autoComplete="off">
          <p className="text-[11px] text-[#6E6E73]">
            US bank accounts only. Your account number is sent securely to our payment provider and is not stored on our servers; we keep only the last 4 digits.
            {account && " Changing your account requires re-verification before your next payout."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Account holder name" value={form.accountHolderName} onChange={set("accountHolderName")} required />
            <select className={inputCls} value={form.legalType} onChange={set("legalType")}>
              <option value="PRIVATE">Individual account</option>
              <option value="BUSINESS">Business account</option>
            </select>
            <input className={inputCls} placeholder="Routing number (9 digits)" inputMode="numeric" maxLength={9} value={form.routingNumber} onChange={set("routingNumber")} required />
            <input className={inputCls} placeholder="Account number" inputMode="numeric" maxLength={17} type="password" autoComplete="off" value={form.accountNumber} onChange={set("accountNumber")} required />
            <select className={inputCls} value={form.accountType} onChange={set("accountType")}>
              <option value="CHECKING">Checking</option>
              <option value="SAVINGS">Savings</option>
            </select>
            <input className={inputCls} placeholder="Street address" value={form.street} onChange={set("street")} required />
            <input className={inputCls} placeholder="City" value={form.city} onChange={set("city")} required />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="State (e.g. FL)" maxLength={2} value={form.state} onChange={set("state")} required />
              <input className={inputCls} placeholder="ZIP" maxLength={10} value={form.zip} onChange={set("zip")} required />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#1D1D1F] hover:bg-[#6E6E73] disabled:opacity-50 text-[#FFFFFF] px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2"
            >
              {saving && <RefreshCw size={14} className="animate-spin" />}
              <span>{saving ? "Saving..." : "Save payout details"}</span>
            </button>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); setForm(EMPTY); }} className="px-4 py-2.5 text-xs text-[#6E6E73]">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
