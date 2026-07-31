"use client";

import React, { useEffect, useState } from "react";
import { Card, Badge, Dialog } from "@/components/ui/custom";
import {
  FileText,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  History,
  MessageSquare
} from "lucide-react";

export default function AdminTaxDocumentsPage() {
  const [creators, setCreators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Review Modal State
  const [selectedCreator, setSelectedCreator] = useState<any | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>("APPROVED");
  const [adminNote, setAdminNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [signedUrlLoading, setSignedUrlLoading] = useState(false);

  // Audit History Modal State
  const [selectedAuditCreator, setSelectedAuditCreator] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchCreators = async () => {
    setLoading(true);
    try {
      let url = "/api/admin/tax-documents?";
      if (statusFilter !== "ALL") url += `status=${statusFilter}&`;
      if (docTypeFilter !== "ALL") url += `docType=${docTypeFilter}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCreators(data.creators);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreators();
  }, [statusFilter, docTypeFilter]);

  const handleOpenReviewModal = (creatorItem: any) => {
    setSelectedCreator(creatorItem);
    setReviewStatus(creatorItem.taxDocument.status === "NOT_SUBMITTED" ? "UNDER_REVIEW" : creatorItem.taxDocument.status);
    setAdminNote(creatorItem.taxDocument.adminNote || "");
    setInternalNote(creatorItem.taxDocument.internalNote || "");
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCreator || !selectedCreator.taxDocument.id) return;

    setSubmittingReview(true);
    try {
      const res = await fetch("/api/admin/tax-documents/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedCreator.taxDocument.id,
          status: reviewStatus,
          adminNote,
          internalNote
        })
      });

      const data = await res.json();
      if (data.success) {
        setSelectedCreator(null);
        fetchCreators();
      } else {
        alert(data.error || "Review update failed.");
      }
    } catch (err: any) {
      alert(err?.message || "Error updating review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDownloadSignedUrl = async (documentId: string, versionId?: string) => {
    setSignedUrlLoading(true);
    try {
      let url = `/api/admin/tax-documents/download?documentId=${documentId}`;
      if (versionId) url += `&versionId=${versionId}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.signedUrl) {
        window.open(data.signedUrl, "_blank");
      } else {
        alert(data.error || "Failed to generate signed download link.");
      }
    } catch (err: any) {
      alert(err?.message || "Download error.");
    } finally {
      setSignedUrlLoading(false);
    }
  };

  const handleViewAuditHistory = async (creatorItem: any) => {
    setSelectedAuditCreator(creatorItem);
    setAuditLoading(true);
    try {
      const docId = creatorItem.taxDocument.id;
      let url = `/api/admin/tax-documents/audit?partnerId=${creatorItem.partnerId}`;
      if (docId) url += `&documentId=${docId}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.auditLogs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  const filteredList = creators.filter(c =>
    c.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><CheckCircle size={12} /> Approved</span>;
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><Clock size={12} /> Under Review</span>;
      case "REJECTED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><AlertTriangle size={12} /> Rejected</span>;
      case "REPLACEMENT_REQUIRED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><RefreshCw size={12} /> Replace Req</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-600">Missing</span>;
    }
  };

  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Creator Tax Documents</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Review, approve, download via short-lived signed URLs, and audit creator W-9 and W-8 tax submissions.
        </p>
      </div>

      {/* FILTERS AND METRICS */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-zinc-400" />
            <input
              type="text"
              placeholder="Search partner, business name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-brand-bg border border-brand-blush rounded-lg text-xs focus:outline-none focus:border-brand-plum"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-brand-plum font-semibold"
            >
              <option value="ALL">All Review Statuses</option>
              <option value="SUBMITTED">Submitted / Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REPLACEMENT_REQUIRED">Replacement Required</option>
              <option value="NOT_SUBMITTED">Missing Documents</option>
            </select>
          </div>

          <div>
            <select
              value={docTypeFilter}
              onChange={e => setDocTypeFilter(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2.5 px-3 focus:outline-none focus:border-brand-plum font-semibold"
            >
              <option value="ALL">All Form Categories (W-9 / W-8)</option>
              <option value="W_9">W-9 Forms Only</option>
              <option value="W_8">W-8 Forms Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* CREATOR TAX TABLE */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-blush/60 text-[10px] uppercase tracking-wider text-brand-wine font-extrabold">
                <th className="py-3 px-4">Partner Creator</th>
                <th className="py-3 px-4">Form Type / Subtype</th>
                <th className="py-3 px-4">Submission Date</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/40 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400 italic">Loading tax submissions...</td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400 italic">No creator tax records match the selected filters.</td>
                </tr>
              ) : (
                filteredList.map(item => {
                  const doc = item.taxDocument;
                  const curVer = doc?.currentVersion;
                  return (
                    <tr key={item.partnerId} className="hover:bg-brand-bg/50 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-brand-plum">
                        <div>{item.businessName}</div>
                        <div className="text-[10px] text-zinc-400 font-normal">{item.contactName} ({item.email})</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold">
                        {curVer ? (
                          <span>{curVer.documentType} {curVer.w8Subtype ? `(${curVer.w8Subtype})` : ""}</span>
                        ) : (
                          <span className="text-zinc-400 italic">N/A</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-zinc-500">
                        {curVer ? new Date(curVer.submissionDate).toLocaleDateString() : "—"}
                      </td>

                      <td className="py-3.5 px-4">
                        {getStatusBadge(doc.status)}
                      </td>

                      <td className="py-3.5 px-4">
                        {curVer ? (
                          <span className="bg-brand-bg px-2 py-0.5 rounded border border-brand-blush text-[11px] font-mono">
                            v{curVer.versionNumber} ({doc.totalVersions} total)
                          </span>
                        ) : "—"}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2">
                        {doc.id && (
                          <>
                            <button
                              onClick={() => handleDownloadSignedUrl(doc.id, curVer?.id)}
                              disabled={signedUrlLoading}
                              title="Download via 15-min Signed S3 URL"
                              className="p-1.5 bg-brand-blush text-brand-plum rounded-lg hover:bg-brand-plum hover:text-brand-cream transition-all"
                            >
                              <Download size={14} />
                            </button>

                            <button
                              onClick={() => handleOpenReviewModal(item)}
                              title="Review Status & Notes"
                              className="p-1.5 bg-brand-plum text-brand-cream rounded-lg hover:bg-brand-wine transition-all"
                            >
                              <Eye size={14} />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleViewAuditHistory(item)}
                          title="View Audit History"
                          className="p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-all"
                        >
                          <History size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* REVIEW MODAL */}
      {selectedCreator && (
        <Dialog
          isOpen={true}
          onClose={() => setSelectedCreator(null)}
          title={`Review Tax Submission - ${selectedCreator.businessName}`}
        >
          <form onSubmit={handleReviewSubmit} className="space-y-4 font-sans text-xs">
            <div className="bg-brand-bg p-3 rounded-lg border border-brand-blush space-y-1 text-zinc-600">
              <p><strong className="text-brand-plum">Creator:</strong> {selectedCreator.contactName} ({selectedCreator.email})</p>
              <p><strong className="text-brand-plum">Document Type:</strong> {selectedCreator.taxDocument.currentVersion?.documentType} {selectedCreator.taxDocument.currentVersion?.w8Subtype || ""}</p>
              <p><strong className="text-brand-plum">Submitted File:</strong> {selectedCreator.taxDocument.currentVersion?.originalFilename}</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Set Review Status</label>
              <select
                value={reviewStatus}
                onChange={e => setReviewStatus(e.target.value)}
                className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2.5 px-3 focus:outline-none"
              >
                <option value="APPROVED">APPROVED (Valid & Signed)</option>
                <option value="REJECTED">REJECTED (Invalid or Incomplete)</option>
                <option value="REPLACEMENT_REQUIRED">REPLACEMENT REQUIRED (Updated form needed)</option>
                <option value="UNDER_REVIEW">UNDER REVIEW</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Creator-Visible Review Note</label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Explain approval status or reasons for rejection/replacement..."
                className="w-full p-2.5 bg-brand-bg border border-brand-blush rounded-lg text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Internal Admin Note (Hidden from Creator)</label>
              <input
                type="text"
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                placeholder="Internal verification notes, EIN match checks, etc."
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-xs focus:outline-none"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedCreator(null)}
                className="flex-1 bg-brand-blush text-brand-plum py-2.5 rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="flex-1 bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg font-bold shadow-md"
              >
                {submittingReview ? "Saving..." : "Save Review Decision"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* AUDIT HISTORY MODAL */}
      {selectedAuditCreator && (
        <Dialog
          isOpen={true}
          onClose={() => setSelectedAuditCreator(null)}
          title={`Audit Trail - ${selectedAuditCreator.businessName}`}
        >
          <div className="space-y-4 font-sans text-xs">
            {auditLoading ? (
              <p className="text-center py-4 text-zinc-400">Loading audit history...</p>
            ) : auditLogs.length === 0 ? (
              <p className="text-center py-4 text-zinc-400">No audit events recorded for this partner.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="p-3 bg-brand-bg border border-brand-blush/60 rounded-lg space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold text-brand-wine">
                      <span>{log.action} BY {log.performedByUserRole}</span>
                      <span className="font-mono text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-zinc-600 leading-snug">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setSelectedAuditCreator(null)}
              className="w-full bg-brand-plum text-brand-cream py-2 rounded-lg font-bold mt-2"
            >
              Close History
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
