"use client";

import React, { useState } from "react";
import { Plus, Play, CheckCircle } from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Site, Partner, CommissionRule } from "@/lib/db/schema";
import { Badge, Dialog } from "@/components/ui/custom";
import { runAttributionTestHarness, AttributionTestResult } from "@/lib/attribution";

export default function WebsiteManagement() {
  // Data states
  const [sites, setSites] = useState<Site[]>(() => db.sites);
  const [partners, setPartners] = useState<Partner[]>(() => db.partners);
  const [rules, setRules] = useState<CommissionRule[]>(() => db.commissionRules);
  
  // Dialog / Test harness states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTestHarnessDialog, setShowTestHarnessDialog] = useState(false);
  const [testResults, setTestResults] = useState<AttributionTestResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  // New Site Form
  const [siteName, setSiteName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hospitableWidgetId, setHospitableWidgetId] = useState("");
  const [commissionRuleId, setCommissionRuleId] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  const refreshData = () => {
    setSites([...db.sites]);
    setPartners(db.partners);
    setRules(db.commissionRules);
  };


  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct Hospitable booking URL format
    const cleanName = siteName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const bookingUrl = `https://book.hiddenhoneyhomes.com/r/${cleanName}`;

    db.addSite({
      partnerId,
      siteName,
      websiteUrl,
      hospitableWidgetId,
      bookingUrl,
      trackingCode: trackingCode || cleanName.toUpperCase(),
      commissionRuleId,
      status: "ACTIVE"
    });

    refreshData();
    setShowAddDialog(false);

    // Reset Form
    setSiteName("");
    setWebsiteUrl("");
    setHospitableWidgetId("");
    setTrackingCode("");

    db.addNotification("SUCCESS", `Referral site "${siteName}" added and tracking code generated.`);
  };

  const handleToggleStatus = (id: string, currentStatus: Site["status"]) => {
    const nextStatusMap: Record<Site["status"], Site["status"]> = {
      ACTIVE: "PAUSED",
      PAUSED: "ARCHIVED",
      ARCHIVED: "ACTIVE",
      SUSPENDED: "ACTIVE" // if suspended, reactivate
    };
    const nextStatus = nextStatusMap[currentStatus];
    db.updateSite(id, { status: nextStatus });
    refreshData();
    db.addNotification("INFO", `Website status updated to ${nextStatus} for site ID ${id}.`);
  };

  const runTestHarness = () => {
    setRunningTests(true);
    setTestResults([]);
    setShowTestHarnessDialog(true);
    
    setTimeout(() => {
      const results = runAttributionTestHarness();
      setTestResults(results);
      setRunningTests(false);
      const allPassed = results.length >= 3 && results.every(result => result.testPassed);
      db.addNotification(
        allPassed ? "SUCCESS" : "WARNING",
        allPassed
          ? "Local attribution mapping test passed for three configured sites. Real Hospitable payload validation is still required."
          : "Add at least three configured sites before running the local attribution mapping test."
      );
    }, 700);
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Website Management</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Register partner landing pages, track Hospitable widget IDs, and configure commission rules.
          </p>
        </div>

        <div className="flex space-x-3 self-end sm:self-auto">
          <button
            onClick={runTestHarness}
            disabled={sites.length < 3}
            title={sites.length < 3 ? "Add at least three partner sites first" : "Run a local mapping test"}
            className="flex items-center space-x-1.5 bg-brand-cream border border-brand-blush hover:border-brand-plum disabled:opacity-50 disabled:cursor-not-allowed text-brand-plum px-3 py-2.5 rounded-lg text-xs font-bold transition-all focus:outline-none"
          >
            <Play size={14} className="text-brand-wine animate-pulse" />
            <span>Run Attribution Test</span>
          </button>

          <button
            onClick={() => {
              if (partners.length > 0) {
                setPartnerId(partners[0].id);
                setCommissionRuleId(rules[0]?.id || "");
              }
              setShowAddDialog(true);
            }}
            className="flex items-center space-x-1.5 bg-brand-plum text-brand-cream hover:bg-brand-wine px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Plus size={16} />
            <span>Add Website</span>
          </button>
        </div>
      </div>

      {/* WEBSITES TABLE */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                <th className="p-4">Site Name</th>
                <th className="p-4">Partner Owner</th>
                <th className="p-4">Widget ID</th>
                <th className="p-4">Tracking Code</th>
                <th className="p-4">Rule Base</th>
                <th className="p-4">Performance</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60 text-sm">
              {sites.map(site => {
                const partner = partners.find(p => p.id === site.partnerId);
                const rule = rules.find(r => r.id === site.commissionRuleId);
                
                // Aggregate performance
                const siteReservations = db.reservations.filter(r => r.siteId === site.id && r.reservationStatus !== "CANCELLED");
                const grossRev = siteReservations.reduce((acc, r) => acc + r.bookingAmount, 0);

                let statusBadge = <Badge type="success">Active</Badge>;
                if (site.status === "PAUSED") {
                  statusBadge = <Badge type="warning">Paused</Badge>;
                } else if (site.status === "SUSPENDED") {
                  statusBadge = <Badge type="danger">Suspended</Badge>;
                } else if (site.status === "ARCHIVED") {
                  statusBadge = <Badge type="gray">Archived</Badge>;
                }

                return (
                  <tr key={site.id} className="hover:bg-brand-blush/10 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-brand-plum">{site.siteName}</div>
                      <a href={site.websiteUrl} target="_blank" rel="noreferrer" className="text-[10px] text-brand-wine hover:underline truncate block max-w-xs">
                        {site.websiteUrl}
                      </a>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-zinc-700">{partner?.contactName || "Unknown"}</div>
                      <span className="text-[10px] text-zinc-400">{partner?.businessName}</span>
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-600">{site.hospitableWidgetId}</td>
                    <td className="p-4 font-mono text-xs font-bold text-brand-plum">{site.trackingCode}</td>
                    <td className="p-4 text-xs font-semibold text-brand-wine">
                      {rule ? rule.name : "Default 10%"}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-brand-plum">${grossRev.toFixed(2)}</div>
                      <span className="text-[10px] text-zinc-400">Bookings: {siteReservations.length}</span>
                    </td>
                    <td className="p-4">{statusBadge}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(site.id, site.status)}
                        className="text-xs font-bold text-brand-plum hover:bg-brand-blush/40 px-2.5 py-1.5 rounded-lg border border-brand-blush/60 transition-colors"
                      >
                        Cycle Status
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIALOG: ADD WEBSITE */}
      <Dialog isOpen={showAddDialog} onClose={() => setShowAddDialog(false)} title="Register Referral Website">
        <form onSubmit={handleAddSite} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Website Name</label>
            <input
              type="text"
              required
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder="e.g. Partner Booking Page"
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Assign Partner Owner</label>
            <select
              value={partnerId}
              onChange={e => setPartnerId(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2 px-2.5 focus:outline-none"
            >
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.businessName} ({p.contactName})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Website URL</label>
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://partner.example.com/stays"
              className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Hospitable Widget ID</label>
              <input
                type="text"
                required
                value={hospitableWidgetId}
                onChange={e => setHospitableWidgetId(e.target.value)}
                placeholder="widget_partner_site_001"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Custom Tracking Code</label>
              <input
                type="text"
                value={trackingCode}
                onChange={e => setTrackingCode(e.target.value)}
                placeholder="HHH-SITE-001"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Commission Plan</label>
            <select
              value={commissionRuleId}
              onChange={e => setCommissionRuleId(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-2 px-2.5 focus:outline-none"
            >
              {rules.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.ruleType})</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg text-xs font-bold transition-all shadow-md mt-4"
          >
            Register Website & Widget ID
          </button>
        </form>
      </Dialog>

      {/* DIALOG: ATTRIBUTION TEST HARNESS REPORT */}
      <Dialog
        isOpen={showTestHarnessDialog}
        onClose={() => setShowTestHarnessDialog(false)}
        title="Attribution Test Harness (Section 16)"
      >
        {runningTests ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-brand-plum border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-brand-plum">Simulating bookings attribution...</p>
            <p className="text-xs text-zinc-400 italic">Validating Widget IDs and Referrers across 3 sites</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`flex items-center space-x-3 p-4 rounded-xl text-xs leading-relaxed border ${testResults.length >= 3 && testResults.every(result => result.testPassed) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <CheckCircle size={20} className="shrink-0" />
              <div>
                <p className="font-bold text-sm">
                  {testResults.length >= 3 && testResults.every(result => result.testPassed) ? "Local Mapping Test Passed" : "Attribution Test Not Ready"}
                </p>
                <p className="mt-0.5">
                  {testResults.length >= 3
                    ? "This only verifies the dashboard's configured mapping. Complete real bookings to prove which identifier Hospitable actually returns."
                    : "Add at least three real partner sites and their widget or tracking identifiers before testing."}
                </p>
              </div>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {testResults.map((tr, index) => (
                <div key={index} className="border border-brand-blush rounded-lg p-4 space-y-3 bg-brand-cream/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-plum">{tr.siteName}</span>
                    <Badge type={tr.testPassed ? "success" : "danger"}>
                      {tr.testPassed ? "Passed" : "Failed"}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 border-t border-brand-blush/60 pt-2">
                    <div>
                      <span className="font-semibold block text-brand-wine">Widget ID configured:</span>
                      <span className="font-mono text-[11px]">{tr.widgetId}</span>
                    </div>
                    <div>
                      <span className="font-semibold block text-brand-wine">Attributed Site ID:</span>
                      <span className="font-mono text-[11px]">{tr.result.siteId || "None"}</span>
                    </div>
                    <div className="col-span-2 mt-1">
                      <span className="font-semibold block text-brand-wine">Attribution Match Logic:</span>
                      <span>{tr.result.attributionSource} (Confidence: {tr.result.matchScore}%)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setShowTestHarnessDialog(false)}
              className="w-full bg-brand-plum text-brand-cream py-2.5 rounded-lg text-xs font-bold hover:bg-brand-wine transition-all"
            >
              Close Test Report
            </button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
