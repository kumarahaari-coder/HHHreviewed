"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge, StatusType } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { formatCurrency } from "@/lib/status-mapper";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/format-date";

type OfflineStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
type Action = "confirm" | "approve" | "reject";

interface OfflinePayment {
  id: string;
  reservation_id: string;
  hostaway_reservation_id: number;
  hostaway_charge_id: number;
  amount: number;
  payment_method: string | null;
  hostaway_status: string;
  status: OfflineStatus;
  detected_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  confirmation_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reservation: {
    confirmation_code: string;
    guest_name: string | null;
    check_in_date: string;
    check_out_date: string;
    gross_amount: number;
    amount_received: number;
    reservation_status: string;
    partner_id: string | null;
    partner_name: string | null;
  } | null;
}

const STATUS_LABEL: Record<OfflineStatus, string> = {
  PENDING_CONFIRMATION: "Awaiting confirmation",
  CONFIRMED: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
const STATUS_TYPE: Record<OfflineStatus, StatusType> = {
  PENDING_CONFIRMATION: "warning",
  CONFIRMED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

const FILTERS: { id: string; label: string; statuses: OfflineStatus[] | null }[] = [
  { id: "open", label: "Needs action", statuses: ["PENDING_CONFIRMATION", "CONFIRMED"] },
  { id: "partner", label: "Partner bookings", statuses: null },
  { id: "approved", label: "Approved", statuses: ["APPROVED"] },
  { id: "closed", label: "Rejected / withdrawn", statuses: ["REJECTED", "WITHDRAWN"] },
  { id: "all", label: "All", statuses: null },
];

export function OfflinePaymentsPanel({ onCountChange }: { onCountChange?: (openCount: number) => void }) {
  const [payments, setPayments] = useState<OfflinePayment[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ payment: OfflinePayment; action: Action } | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/offline-payments");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load offline payments.");
      setPayments(data.payments);
      setCurrentUserId(data.currentUserId);
      setRole(data.role);
      onCountChange?.(data.payments.filter((p: OfflinePayment) => p.status === "PENDING_CONFIRMATION" || p.status === "CONFIRMED").length);
    } catch (err: any) {
      setError(err.message || "Failed to load offline payments.");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const canAct = role === "SUPER_ADMIN" || role === "FINANCE_ADMIN";
  const active = FILTERS.find((f) => f.id === filter)!;
  const visible = payments.filter((p) => {
    if (filter === "partner") return Boolean(p.reservation?.partner_id);
    return active.statuses ? active.statuses.includes(p.status) : true;
  });
  const pagination = usePagination(visible, filter);

  const openDialog = (payment: OfflinePayment, action: Action) => {
    setDialog({ payment, action });
    setReason("");
    setDialogError(null);
  };

  const submit = async () => {
    if (!dialog) return;
    setBusyId(dialog.payment.id);
    setDialogError(null);
    try {
      const res = await fetch(`/api/admin/offline-payments/${dialog.payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: dialog.action, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Action failed.");
      if (dialog.action === "approve") {
        setNotice(`Approved. Booking now shows ${formatCurrency(data.amountReceived)} received (${data.paymentStatus}). Commission: ${data.realization?.status}.`);
      } else {
        setNotice(dialog.action === "confirm" ? "Confirmed. A different admin must now approve it." : "Rejected.");
      }
      setDialog(null);
      await load();
    } catch (err: any) {
      setDialogError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const dialogTitle = dialog
    ? { confirm: "Confirm offline payment", approve: "Approve offline payment", reject: "Reject offline payment" }[dialog.action]
    : "";

  return (
    <div className="space-y-4 font-sans">
      <div className="rounded-xl border border-divider-soft bg-surface-subtle p-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-surface border border-divider-soft text-primary shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div className="text-xs text-secondary leading-relaxed">
          <div className="font-bold text-primary mb-0.5">Payments marked paid in Hostaway without Stripe</div>
          Cash, bank transfers and manual entries cannot be verified automatically. One admin confirms the money arrived (with a
          reason, e.g. the bank reference) and a <strong>different</strong> admin approves it. Only approved payments count as received
          on the booking.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filter === f.id ? "bg-primary text-white border-primary" : "bg-surface border-divider-soft text-secondary hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} iconClassName={loading ? "animate-spin" : ""} onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-divider-soft bg-surface-subtle px-4 py-3 text-xs text-primary flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" className="text-secondary hover:text-primary" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {!canAct && !loading && (
        <div className="rounded-lg border border-divider-soft bg-surface-subtle px-4 py-3 text-xs text-secondary">
          You can view these payments. Only a Super Admin or Finance Admin can confirm, approve or reject them.
        </div>
      )}

      <div className="bg-surface border border-divider rounded-lg overflow-hidden">
        {loading && payments.length === 0 ? (
          <div className="py-12 text-center text-xs text-secondary">Loading offline payments…</div>
        ) : visible.length === 0 ? (
          <div className="py-12">
            <EmptyState title="Nothing here" description="No offline payments match this view." />
          </div>
        ) : (
          <div className="divide-y divide-divider-soft">
            {pagination.pageItems.map((p) => {
              const iConfirmed = p.confirmed_by === currentUserId;
              return (
                <div key={p.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-surface-subtle border border-divider-soft text-primary shrink-0 hidden sm:block">
                    <Banknote size={18} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-primary font-mono truncate">{p.reservation?.confirmation_code || `Hostaway #${p.hostaway_reservation_id}`}</span>
                      <StatusBadge type={STATUS_TYPE[p.status]}>{STATUS_LABEL[p.status]}</StatusBadge>
                      {p.reservation?.partner_name && <StatusBadge type="accent">{p.reservation.partner_name}</StatusBadge>}
                      {p.hostaway_status !== "paid" && <StatusBadge type="danger">Hostaway now: {p.hostaway_status}</StatusBadge>}
                    </div>
                    <div className="text-xs text-secondary">
                      {p.reservation ? formatDateRange(p.reservation.check_in_date, p.reservation.check_out_date) : "—"} · Booking{" "}
                      {p.reservation ? formatCurrency(p.reservation.gross_amount) : "—"} · Received so far{" "}
                      {p.reservation ? formatCurrency(p.reservation.amount_received) : "—"}
                    </div>
                    <div className="text-xs text-secondary">
                      Method: <span className="text-primary">{p.payment_method || "offline"}</span> · Detected {formatDateTime(p.detected_at)}
                    </div>
                    {p.confirmation_reason && (
                      <div className="text-xs text-secondary">
                        Confirmed {p.confirmed_at ? formatDate(p.confirmed_at) : ""}: <span className="text-primary">“{p.confirmation_reason}”</span>
                      </div>
                    )}
                    {p.rejection_reason && <div className="text-xs text-secondary">Rejected: “{p.rejection_reason}”</div>}
                  </div>
                  <div className="lg:text-right shrink-0">
                    <div className="text-lg font-semibold text-primary font-mono tabular-nums">{formatCurrency(p.amount)}</div>
                  </div>
                  {canAct && (p.status === "PENDING_CONFIRMATION" || p.status === "CONFIRMED") && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {p.status === "PENDING_CONFIRMATION" && (
                        <Button size="sm" onClick={() => openDialog(p, "confirm")} disabled={p.hostaway_status !== "paid"}>Confirm</Button>
                      )}
                      {p.status === "CONFIRMED" && (
                        <Button size="sm" onClick={() => openDialog(p, "approve")} disabled={iConfirmed || p.hostaway_status !== "paid"} title={iConfirmed ? "A different admin must approve" : undefined}>
                          {iConfirmed ? "Needs another admin" : "Approve"}
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => openDialog(p, "reject")}>Reject</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          className="border-t border-divider-soft"
        />
      </div>

      <Dialog
        isOpen={!!dialog}
        onClose={() => setDialog(null)}
        title={dialogTitle}
        description={dialog ? `${dialog.payment.reservation?.confirmation_code || dialog.payment.hostaway_reservation_id} · ${formatCurrency(dialog.payment.amount)}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)}>Cancel</Button>
            <Button size="sm" variant={dialog?.action === "reject" ? "destructive" : "primary"} onClick={submit} disabled={busyId !== null || (dialog?.action !== "approve" && reason.trim().length < 5)}>
              {busyId ? "Working…" : dialog?.action === "approve" ? "Approve payment" : dialog?.action === "reject" ? "Reject payment" : "Confirm payment"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-secondary">
          {dialog?.action === "approve" ? (
            <p>
              Approving counts <strong className="text-primary">{formatCurrency(dialog.payment.amount)}</strong> as received on this booking.
              The commission is realised when the booking becomes fully paid and has an accrual. Confirmed by another admin with the reason:
              <span className="block mt-2 text-primary">“{dialog.payment.confirmation_reason}”</span>
            </p>
          ) : (
            <>
              <p>
                {dialog?.action === "confirm"
                  ? "Confirm only if you have checked that this money really arrived. Give a reason a reviewer can verify, such as the bank transfer reference."
                  : "Explain why this payment is being rejected."}
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={dialog?.action === "confirm" ? "e.g. Bank transfer ref 8841-2290, received 12 Nov" : "Reason"}
                className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </>
          )}
          {dialogError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{dialogError}</div>}
        </div>
      </Dialog>
    </div>
  );
}
