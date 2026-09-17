"use client";

import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableMobileCard } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
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
  Lock
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
        return <StatusBadge variant="success">Approved</StatusBadge>;
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return <StatusBadge variant="info">Under Review</StatusBadge>;
      case "REJECTED":
        return <StatusBadge variant="danger">Rejected</StatusBadge>;
      case "REPLACEMENT_REQUIRED":
        return <StatusBadge variant="warning">Replace Req</StatusBadge>;
      default:
        return <StatusBadge variant="gray">Missing</StatusBadge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Documents"
        description="Operational compliance readiness for partner W-9 and W-8 submissions. Sensitive PII, Tax IDs, and S3 credentials remain masked."
      />

      {/* Security Banner */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-[var(--canvas)] text-[var(--primary)]">
            <Lock size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--primary)]">PII Protection Active</div>
            <div className="text-xs text-[var(--secondary)]">
              SSNs, EINs, and bank routing credentials are encrypted at rest and never exposed in the interface.
            </div>
          </div>
        </div>
        <StatusBadge variant="success">Enforced</StatusBadge>
      </div>

      {/* FILTERS */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-[var(--secondary)]" />
            <input
              type="text"
              placeholder="Search partner..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--canvas)] border border-[var(--border)] rounded-md text-xs focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-[var(--canvas)] border border-[var(--border)] rounded-md text-xs py-2 px-3 focus:outline-none focus:border-[var(--primary)] font-medium text-[var(--primary)]"
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
              className="w-full bg-[var(--canvas)] border border-[var(--border)] rounded-md text-xs py-2 px-3 focus:outline-none focus:border-[var(--primary)] font-medium text-[var(--primary)]"
            >
              <option value="ALL">All Form Categories (W-9 / W-8)</option>
              <option value="W_9">W-9 Forms Only</option>
              <option value="W_8">W-8 Forms Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* CREATOR TAX TABLE */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Form Type / Subtype</TableHead>
              <TableHead>Submission Date</TableHead>
              <TableHead>Readiness Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-[var(--secondary)]">Loading tax submissions...</TableCell>
              </TableRow>
            ) : filteredList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-[var(--secondary)]">No partner tax records match the selected filters.</TableCell>
              </TableRow>
            ) : (
              filteredList.map(item => {
                const doc = item.taxDocument;
                const curVer = doc?.currentVersion;
                return (
                  <TableRow key={item.partnerId}>
                    <TableCell>
                      <div className="font-semibold text-[var(--primary)]">{item.businessName}</div>
                      <div className="text-xs text-[var(--secondary)]">{item.contactName} ({item.email})</div>
                    </TableCell>

                    <TableCell className="font-mono font-medium">
                      {curVer ? (
                        <span>{curVer.documentType} {curVer.w8Subtype ? `(${curVer.w8Subtype})` : ""}</span>
                      ) : (
                        <span className="text-[var(--secondary)] italic">N/A</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-[var(--secondary)]">
                      {curVer ? new Date(curVer.submissionDate).toLocaleDateString() : "—"}
                    </TableCell>

                    <TableCell>
                      {getStatusBadge(doc.status)}
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {curVer ? (
                        <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--canvas)]">
                          v{curVer.versionNumber} ({doc.totalVersions} total)
                        </span>
                      ) : "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {doc.id && (
                          <>
                            <button
                              onClick={() => handleDownloadSignedUrl(doc.id, curVer?.id)}
                              disabled={signedUrlLoading}
                              title="Download via Short-Lived Signed URL"
                              className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--canvas)] text-[var(--primary)]"
                            >
                              <Download size={14} />
                            </button>

                            <button
                              onClick={() => handleOpenReviewModal(item)}
                              title="Review Status & Notes"
                              className="p-1.5 rounded-md bg-[var(--primary)] text-white hover:bg-[#333336]"
                            >
                              <Eye size={14} />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleViewAuditHistory(item)}
                          title="View Audit History"
                          className="p-1.5 rounded-md border border-[var(--border)] text-[var(--secondary)] hover:bg-[var(--canvas)]"
                        >
                          <History size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="md:hidden divide-y divide-[var(--border)]">
          {filteredList.map(item => (
            <TableMobileCard
              key={item.partnerId}
              title={item.businessName}
              subtitle={`${item.contactName} (${item.email})`}
              badge={getStatusBadge(item.taxDocument.status)}
              details={[
                { label: "Form Type", value: item.taxDocument?.currentVersion?.documentType || "N/A" },
                { label: "Version", value: item.taxDocument?.currentVersion ? `v${item.taxDocument.currentVersion.versionNumber}` : "—" }
              ]}
              action={
                <button
                  onClick={() => handleOpenReviewModal(item)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white"
                >
                  Review
                </button>
              }
            />
          ))}
        </div>
      </div>

      {/* REVIEW DIALOG */}
      <Dialog
        isOpen={!!selectedCreator}
        onClose={() => setSelectedCreator(null)}
        title={`Review Tax Submission — ${selectedCreator?.businessName || ""}`}
      >
        {selectedCreator && (
          <form onSubmit={handleReviewSubmit} className="space-y-4 font-sans text-xs">
            <div className="p-3 rounded-md bg-[var(--canvas)] border border-[var(--border)] space-y-1 text-[var(--secondary)]">
              <div><strong className="text-[var(--primary)]">Partner:</strong> {selectedCreator.contactName} ({selectedCreator.email})</div>
              <div><strong className="text-[var(--primary)]">Document Type:</strong> {selectedCreator.taxDocument.currentVersion?.documentType} {selectedCreator.taxDocument.currentVersion?.w8Subtype || ""}</div>
              <div><strong className="text-[var(--primary)]">Submitted File:</strong> {selectedCreator.taxDocument.currentVersion?.originalFilename}</div>
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Set Review Status</label>
              <select
                value={reviewStatus}
                onChange={e => setReviewStatus(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs py-2 px-3 focus:outline-none"
              >
                <option value="APPROVED">APPROVED (Valid & Signed)</option>
                <option value="REJECTED">REJECTED (Invalid or Incomplete)</option>
                <option value="REPLACEMENT_REQUIRED">REPLACEMENT REQUIRED (Updated form needed)</option>
                <option value="UNDER_REVIEW">UNDER REVIEW</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Partner-Visible Review Note</label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Notes visible to partner regarding submission status..."
                className="w-full p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Internal Admin Note (Hidden from Partner)</label>
              <input
                type="text"
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                placeholder="Internal verification notes, EIN match checks, etc."
                className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedCreator(null)}
                className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
              >
                {submittingReview ? "Saving..." : "Save Review Decision"}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      {/* AUDIT HISTORY DIALOG */}
      <Dialog
        isOpen={!!selectedAuditCreator}
        onClose={() => setSelectedAuditCreator(null)}
        title={`Audit Trail — ${selectedAuditCreator?.businessName || ""}`}
      >
        <div className="space-y-4 font-sans text-xs">
          {auditLoading ? (
            <p className="text-center py-4 text-[var(--secondary)]">Loading audit history...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-center py-4 text-[var(--secondary)]">No audit events recorded for this partner.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="p-3 bg-[var(--canvas)] border border-[var(--border)] rounded-md space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[var(--primary)]">
                    <span>{log.action} BY {log.performedByUserRole}</span>
                    <span className="font-mono text-[var(--secondary)]">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-[var(--secondary)] leading-snug">{log.details}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setSelectedAuditCreator(null)}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white"
            >
              Close History
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

