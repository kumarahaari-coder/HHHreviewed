"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Partner, User as UserType, TaxDocumentStatus, TaxDocumentType, W8Subtype } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import {
  Building,
  CreditCard,
  Mail,
  Phone,
  FileText,
  UploadCloud,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Info
} from "lucide-react";

export default function PartnerProfile() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  // Tax Info Form State
  const [docType, setDocType] = useState<TaxDocumentType>("W_9");
  const [w8Subtype, setW8Subtype] = useState<W8Subtype>("W_8BEN");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [taxDocStatus, setTaxDocStatus] = useState<TaxDocumentStatus>("NOT_SUBMITTED");
  const [taxDetails, setTaxDetails] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchTaxStatus = (partnerId: string) => {
    const data = db.getTaxDocumentByPartner(partnerId);
    if (data) {
      setTaxDocStatus(data.status);
      setTaxDetails(data);
    } else {
      setTaxDocStatus("NOT_SUBMITTED");
      setTaxDetails(null);
    }
  };

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    setCurrentUser(user);
    const p = db.partners.find(p => p.id === user.partnerId) || null;
    setPartner(p);
    if (p) fetchTaxStatus(p.id);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setMessage({ type: "error", text: "Only PDF files (.pdf) are permitted." });
        setSelectedFile(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setMessage({ type: "error", text: "File size exceeds the 10MB maximum limit." });
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleTaxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner) return;
    if (!selectedFile) {
      setMessage({ type: "error", text: "Please select a completed PDF tax document to upload." });
      return;
    }
    if (!confirmationChecked) {
      setMessage({ type: "error", text: "You must confirm that the form is completed and signed." });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("partnerId", partner.id);
      formData.append("documentType", docType);
      if (docType === "W_8") formData.append("w8Subtype", w8Subtype);
      formData.append("confirmationChecked", "true");
      formData.append("file", selectedFile);

      const res = await fetch("/api/tax-documents/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setSelectedFile(null);
        setConfirmationChecked(false);
        fetchTaxStatus(partner.id);
      } else {
        setMessage({ type: "error", text: data.error || "Upload failed." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Error submitting tax document." });
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = (status: TaxDocumentStatus) => {
    switch (status) {
      case "APPROVED":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><CheckCircle size={14} /> Approved</span>;
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300"><Clock size={14} /> Under Review</span>;
      case "REJECTED":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300"><AlertTriangle size={14} /> Rejected</span>;
      case "REPLACEMENT_REQUIRED":
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300"><RefreshCw size={14} /> Replacement Required</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-600 border border-zinc-300"><Info size={14} /> Not Submitted</span>;
    }
  };

  if (!partner || !currentUser) return null;

  return (
    <div className="space-y-8 font-sans max-w-3xl">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Creator Settings</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Manage your partner profile, US tax documentation, and payout connection status.
        </p>
      </div>

      {/* PARTNER PROFILE CARD */}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-zinc-700">
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

          <div className="flex items-center space-x-3">
            <CreditCard size={16} className="text-zinc-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">Transfer Payout Frequency</span>
              <span className="font-semibold text-brand-plum uppercase">
                {partner.paymentMethod.replace("_", " ")} ({partner.payoutFrequency})
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* STRIPE CONNECT PAYOUT STATUS CARD */}
      <Card className="space-y-4">
        <div className="flex justify-between items-center border-b border-brand-blush/60 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
            <CreditCard size={16} />
            Stripe Creator Payout Account
          </h3>
          <Badge type="plum">Stripe Connect Express</Badge>
        </div>
        <div className="flex justify-between items-center bg-brand-bg/50 p-4 rounded-xl border border-brand-blush/60">
          <div>
            <p className="text-xs font-bold text-brand-plum">Direct Commission Payouts</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {partner.stripeConnectAccountId
                ? `Connected Account: ${partner.stripeConnectAccountId}`
                : "Connect your bank account or debit card for direct commission payout transfers."}
            </p>
          </div>
          <button
            onClick={() => alert("Redirecting to Stripe Connect Express onboarding portal...")}
            className="bg-brand-plum text-brand-cream hover:bg-brand-wine px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
          >
            <span>{partner.stripeConnectAccountId ? "Manage Account" : "Setup Payouts"}</span>
            <ExternalLink size={14} />
          </button>
        </div>
      </Card>

      {/* TAX INFORMATION SECTION */}
      <Card className="space-y-6">
        <div className="flex justify-between items-center border-b border-brand-blush/60 pb-3">
          <div className="flex items-center space-x-2">
            <FileText size={18} className="text-brand-plum" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-wine">Tax Information</h3>
          </div>
          {getStatusBadge(taxDocStatus)}
        </div>

        {/* Status Callout & Admin Review Notes */}
        {taxDetails && taxDetails.currentVersion && (
          <div className="bg-brand-bg p-4 rounded-xl border border-brand-blush space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold uppercase">Current Submitted Document:</span>
              <span className="font-mono font-semibold text-brand-plum">{taxDetails.currentVersion.originalFilename}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold uppercase">Form Type / Subtype:</span>
              <span className="font-semibold text-brand-wine">
                {taxDetails.currentVersion.documentType} {taxDetails.currentVersion.w8Subtype ? `(${taxDetails.currentVersion.w8Subtype})` : ""} (v{taxDetails.currentVersion.versionNumber})
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold uppercase">Submission Date:</span>
              <span className="text-zinc-600">{new Date(taxDetails.currentVersion.submissionDate).toLocaleString()}</span>
            </div>

            {taxDetails.adminNote && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                <span className="font-bold block mb-1">Admin Review Note:</span>
                {taxDetails.adminNote}
              </div>
            )}
          </div>
        )}

        {/* PRIVACY NOTICE */}
        <div className="bg-sky-50 border border-sky-200 text-sky-900 text-xs p-4 rounded-xl flex gap-3 items-start">
          <ShieldCheck size={20} className="text-sky-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Tax Compliance Privacy Safeguards</p>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              Your tax form contains confidential information. Uploaded documents are encrypted and stored in private object storage. Access is restricted strictly to authorized finance administrators using short-lived authorization links. Hidden Honey Homes does not provide tax advice; please consult a qualified tax professional to choose between Form W-9 and Form W-8.
            </p>
          </div>
        </div>

        {/* FEEDBACK MESSAGES */}
        {message && (
          <div className={`p-3 rounded-lg text-xs font-semibold ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
            {message.text}
          </div>
        )}

        {/* UPLOAD FORM */}
        <form onSubmit={handleTaxSubmit} className="space-y-5 border-t border-brand-blush/60 pt-5">
          <h4 className="text-xs font-extrabold text-brand-plum uppercase tracking-wider">
            {taxDocStatus === "NOT_SUBMITTED" ? "Upload Completed US Tax Form" : "Replace Tax Document"}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Tax Document Category</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as TaxDocumentType)}
                className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-brand-plum"
              >
                <option value="W_9">W-9 (US Persons / Entities)</option>
                <option value="W_8">W-8 (Foreign Persons / Entities)</option>
              </select>
            </div>

            {docType === "W_8" && (
              <div>
                <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">W-8 Subtype</label>
                <select
                  value={w8Subtype}
                  onChange={e => setW8Subtype(e.target.value as W8Subtype)}
                  className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-brand-plum"
                >
                  <option value="W_8BEN">W-8BEN (Foreign Individuals)</option>
                  <option value="W_8BEN_E">W-8BEN-E (Foreign Entities)</option>
                  <option value="OTHER">Other W-8 Subtype</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Signed PDF Document</label>
            <div className="border-2 border-dashed border-brand-blush hover:border-brand-plum rounded-xl p-6 text-center bg-brand-bg/40 transition-colors cursor-pointer relative">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <UploadCloud size={28} className="mx-auto text-brand-wine mb-2" />
              {selectedFile ? (
                <p className="text-xs font-bold text-brand-plum">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
              ) : (
                <>
                  <p className="text-xs font-bold text-brand-plum">Click or drag PDF tax document here to upload</p>
                  <p className="text-[10px] text-zinc-400 mt-1">Only PDF format supported (Max 10 MB). Executables and archives are rejected.</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <input
              type="checkbox"
              id="declaration"
              checked={confirmationChecked}
              onChange={e => setConfirmationChecked(e.target.checked)}
              className="mt-1 rounded border-brand-blush text-brand-plum focus:ring-brand-plum"
            />
            <label htmlFor="declaration" className="text-xs text-zinc-600 leading-snug cursor-pointer">
              I confirm that the uploaded tax form is fully completed, signed by an authorized signatory, and contains accurate personal or business tax information.
            </label>
          </div>

          <button
            type="submit"
            disabled={uploading || !selectedFile || !confirmationChecked}
            className="w-full bg-brand-plum hover:bg-brand-wine disabled:opacity-50 text-brand-cream py-3 rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-2"
          >
            {uploading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Running PDF Security Checks & Uploading...</span>
              </>
            ) : (
              <>
                <UploadCloud size={14} />
                <span>{taxDocStatus === "NOT_SUBMITTED" ? "Submit Tax Document" : "Upload Replacement Version"}</span>
              </>
            )}
          </button>
        </form>
      </Card>
    </div>
  );
}
