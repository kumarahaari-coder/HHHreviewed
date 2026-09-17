"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Partner, User as UserType, TaxDocumentStatus, TaxDocumentType, W8Subtype } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewPartnerId = searchParams?.get("previewPartnerId");

  useEffect(() => {
    let isSubscribed = true;

    async function loadProfile() {
      try {
        const url = previewPartnerId
          ? `/api/partner/dashboard?previewPartnerId=${encodeURIComponent(previewPartnerId)}`
          : "/api/partner/dashboard";

        const res = await fetch(url);
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.success && data.partner) {
          setPartner(data.partner);
          if (data.taxDocument) {
            setTaxDocStatus(data.taxDocument.status);
            setTaxDetails(data.taxDocument);
          } else {
            setTaxDocStatus("NOT_SUBMITTED");
            setTaxDetails(null);
          }
        }
      } catch (err) {
        console.error("[Partner Profile Error]", err);
      }
    }

    loadProfile();

    return () => {
      isSubscribed = false;
    };
  }, [previewPartnerId]);

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

  const getStatusVariant = (status: TaxDocumentStatus) => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return "info";
      case "REJECTED":
        return "danger";
      case "REPLACEMENT_REQUIRED":
        return "warning";
      default:
        return "neutral";
    }
  };

  if (!partner) return null;

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="Account & Tax Profile"
        description="Manage your partner details, US tax documentation, and payout preferences."
      />


      {/* PARTNER PROFILE CARD */}
      <Card className="space-y-6 p-6">
        <div className="flex items-center space-x-4 border-b border-[#E8E8ED] pb-4">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#1D1D1F] text-xl font-bold border border-[#D2D2D7]">
            {partner.contactName[0]}
          </div>
          <div>
            <h3 className="font-bold text-[#1D1D1F] text-lg">{partner.contactName}</h3>
            <span className="text-xs text-[#6E6E73] font-medium">{partner.businessName}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#1D1D1F]">
          <div className="flex items-center space-x-3">
            <Building size={16} className="text-[#6E6E73] shrink-0" />
            <div>
              <span className="text-[10px] text-[#6E6E73] block font-semibold uppercase tracking-wider">Business Entity</span>
              <span className="font-medium text-[#1D1D1F]">{partner.businessName}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Mail size={16} className="text-[#6E6E73] shrink-0" />
            <div>
              <span className="text-[10px] text-[#6E6E73] block font-semibold uppercase tracking-wider">Email Address</span>
              <span className="font-medium text-[#1D1D1F]">{partner.email}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Phone size={16} className="text-[#6E6E73] shrink-0" />
            <div>
              <span className="text-[10px] text-[#6E6E73] block font-semibold uppercase tracking-wider">Contact Phone</span>
              <span className="font-medium text-[#1D1D1F]">{partner.phone || "—"}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <CreditCard size={16} className="text-[#6E6E73] shrink-0" />
            <div>
              <span className="text-[10px] text-[#6E6E73] block font-semibold uppercase tracking-wider">Payout Frequency</span>
              <span className="font-medium text-[#1D1D1F] uppercase">
                {(partner.paymentMethod || "BANK_TRANSFER").replace(/_/g, " ")} ({partner.payoutFrequency || "MONTHLY"})
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* PAYOUT CONNECTION STATUS */}
      <Card className="space-y-4 p-6">
        <div className="flex justify-between items-center border-b border-[#E8E8ED] pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6E6E73] flex items-center gap-2">
            <CreditCard size={16} />
            Payout Account Status
          </h3>
          <StatusBadge variant="success">ACTIVE</StatusBadge>
        </div>
        <div className="flex justify-between items-center bg-[#F5F5F7] p-4 rounded-xl border border-[#E8E8ED]">
          <div>
            <p className="text-xs font-semibold text-[#1D1D1F]">Direct Commission Transfer</p>
            <p className="text-[11px] text-[#6E6E73] mt-0.5">
              Account configured for direct ACH/bank commission payouts.
            </p>
          </div>
        </div>
      </Card>

      {/* TAX INFORMATION SECTION */}
      <Card className="space-y-6 p-6">
        <div className="flex justify-between items-center border-b border-[#E8E8ED] pb-3">
          <div className="flex items-center space-x-2">
            <FileText size={18} className="text-[#1D1D1F]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6E6E73]">Tax Information</h3>
          </div>
          <StatusBadge variant={getStatusVariant(taxDocStatus)}>{taxDocStatus}</StatusBadge>
        </div>

        {/* Status Callout */}
        {taxDetails && taxDetails.currentVersion && (
          <div className="bg-[#F5F5F7] p-4 rounded-xl border border-[#E8E8ED] space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#6E6E73] font-semibold uppercase">Submitted Document:</span>
              <span className="font-mono font-medium text-[#1D1D1F]">{taxDetails.currentVersion.originalFilename}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#6E6E73] font-semibold uppercase">Form Type:</span>
              <span className="font-medium text-[#1D1D1F]">
                {taxDetails.currentVersion.documentType} {taxDetails.currentVersion.w8Subtype ? `(${taxDetails.currentVersion.w8Subtype})` : ""}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#6E6E73] font-semibold uppercase">Submission Date:</span>
              <span className="text-[#6E6E73]">{new Date(taxDetails.currentVersion.submissionDate).toLocaleString()}</span>
            </div>

            {taxDetails.adminNote && (
              <div className="mt-3 p-3 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-xs text-[#1D1D1F]">
                <span className="font-semibold block mb-1">Admin Review Note:</span>
                {taxDetails.adminNote}
              </div>
            )}
          </div>
        )}

        {/* PRIVACY NOTICE */}
        <div className="bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-xs p-4 rounded-xl flex gap-3 items-start">
          <ShieldCheck size={20} className="text-[#1D1D1F] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Tax Compliance & Privacy Protection</p>
            <p className="text-[11px] text-[#6E6E73] leading-relaxed">
              Your tax documents are encrypted and stored in private secure object storage. Access is restricted strictly to authorized finance administrators. Tax ID numbers and sensitive credentials are never displayed in ordinary user interfaces.
            </p>
          </div>
        </div>

        {/* FEEDBACK MESSAGES */}
        {message && (
          <div className={`p-3 rounded-lg text-xs font-medium ${message.type === "success" ? "bg-[#F5F5F7] text-[#1D1D1F] border border-[#D2D2D7]" : "bg-[#F5F5F7] text-rose-800 border border-rose-300"}`}>
            {message.text}
          </div>
        )}

        {/* UPLOAD FORM */}
        <form onSubmit={handleTaxSubmit} className="space-y-5 border-t border-[#E8E8ED] pt-5">
          <h4 className="text-xs font-semibold text-[#1D1D1F] uppercase tracking-wider">
            {taxDocStatus === "NOT_SUBMITTED" ? "Upload Completed US Tax Form" : "Replace Tax Document"}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-[#6E6E73] uppercase mb-1">Tax Document Category</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as TaxDocumentType)}
                className="w-full bg-[#FFFFFF] border border-[#D2D2D7] rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-[#1D1D1F]"
              >
                <option value="W_9">W-9 (US Persons / Entities)</option>
                <option value="W_8">W-8 (Foreign Persons / Entities)</option>
              </select>
            </div>

            {docType === "W_8" && (
              <div>
                <label className="block text-[10px] font-semibold text-[#6E6E73] uppercase mb-1">W-8 Subtype</label>
                <select
                  value={w8Subtype}
                  onChange={e => setW8Subtype(e.target.value as W8Subtype)}
                  className="w-full bg-[#FFFFFF] border border-[#D2D2D7] rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-[#1D1D1F]"
                >
                  <option value="W_8BEN">W-8BEN (Foreign Individuals)</option>
                  <option value="W_8BEN_E">W-8BEN-E (Foreign Entities)</option>
                  <option value="OTHER">Other W-8 Subtype</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#6E6E73] uppercase mb-1">Signed PDF Document</label>
            <div className="border-2 border-dashed border-[#D2D2D7] hover:border-[#1D1D1F] rounded-xl p-6 text-center bg-[#F5F5F7]/40 transition-colors cursor-pointer relative">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <UploadCloud size={28} className="mx-auto text-[#6E6E73] mb-2" />
              {selectedFile ? (
                <p className="text-xs font-semibold text-[#1D1D1F]">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-[#1D1D1F]">Click or drag PDF tax document here to upload</p>
                  <p className="text-[10px] text-[#6E6E73] mt-1">Only PDF format supported (Max 10 MB).</p>
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
              className="mt-1 rounded border-[#D2D2D7] text-[#1D1D1F] focus:ring-[#1D1D1F]"
            />
            <label htmlFor="declaration" className="text-xs text-[#6E6E73] leading-snug cursor-pointer">
              I confirm that the uploaded tax form is fully completed, signed by an authorized signatory, and contains accurate personal or business tax information.
            </label>
          </div>

          <button
            type="submit"
            disabled={uploading || !selectedFile || !confirmationChecked}
            className="w-full bg-[#1D1D1F] hover:bg-[#6E6E73] disabled:opacity-50 text-[#FFFFFF] py-3 rounded-lg text-xs font-medium transition-all shadow-2xs flex items-center justify-center space-x-2"
          >
            {uploading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Submitting Tax Document...</span>
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

