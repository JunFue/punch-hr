"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { Branch, CompanySettings, EnrollmentCode, UserProfile } from "@/types/hr";
import { formatPHP } from "@/lib/payroll-engine";

interface AdminEnrollmentPanelProps {
  adminUser: UserProfile;
  settings: CompanySettings;
  branches?: Branch[];
}

function getRemainingTimeLabel(expiresAtIso: string): {
  expired: boolean;
  label: string;
} {
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return { expired: true, label: "Expired (>1 hr)" };
  }
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return {
    expired: false,
    label: `${mins}m ${String(secs).padStart(2, "0")}s remaining`,
  };
}

export default function AdminEnrollmentPanel({
  adminUser,
  settings,
  branches = [],
}: AdminEnrollmentPanelProps) {
  const [codes, setCodes] = useState<EnrollmentCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, setTick] = useState<number>(0);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    branches[0]?.id || ""
  );

  // New Code configuration defaults
  const [defaultDepartment, setDefaultDepartment] = useState<string>(
    "Operations & Therapy"
  );
  const [defaultPosition, setDefaultPosition] = useState<string>(
    "Wellness Recovery Specialist"
  );
  const [defaultBasicSalary, setDefaultBasicSalary] = useState<number>(20000);
  const [defaultDailyShareRate, setDefaultDailyShareRate] =
    useState<number>(380);
  const [dailyShareEligible, setDailyShareEligible] = useState<boolean>(true);

  const fetchCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/enrollment", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.codes)) {
        setCodes(data.codes);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  // Live 1-second ticker for countdown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    const chosenBranch = branches.find((b) => b.id === selectedBranchId);

    try {
      const res = await fetch("/api/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId: adminUser.id,
          adminName: adminUser.full_name,
          businessName: settings.wellness_center_name,
          branchId: chosenBranch?.id || null,
          branchName: chosenBranch?.name || null,
          defaultDepartment,
          defaultPosition,
          defaultBasicSalary,
          defaultDailyShareRate,
          dailyShareEligible,
        }),
      });
      const data = await res.json();
      if (res.ok && data.enrollmentCode) {
        setCodes((prev) => [data.enrollmentCode, ...prev]);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await fetch(`/api/enrollment?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await fetchCodes();
  };

  const handleCopy = (codeObj: EnrollmentCode) => {
    navigator.clipboard.writeText(codeObj.code);
    setCopiedId(codeObj.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Generate New 1-Hour Enrollment Code */}
      <form
        onSubmit={handleGenerateCode}
        className="lg:col-span-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-xs space-y-4 h-fit"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Generate Employee Enrollment Code
              </h3>
              <p className="text-[11px] text-slate-500">
                Code automatically expires 1 hour after generation
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
            <Clock className="h-3 w-3" />1 Hr TTL
          </span>
        </div>

        <div className="space-y-3 text-xs">
          {branches.length > 0 && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Assign to Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900 bg-white"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    📍 {b.name} ({b.address || "Main"})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Business / Wellness Center
            </label>
            <input
              type="text"
              disabled
              value={settings.wellness_center_name}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Default Department
              </label>
              <input
                type="text"
                value={defaultDepartment}
                onChange={(e) => setDefaultDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Default Position
              </label>
              <input
                type="text"
                value={defaultPosition}
                onChange={(e) => setDefaultPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Starting Basic Salary (PHP)
              </label>
              <input
                type="number"
                value={defaultBasicSalary}
                onChange={(e) =>
                  setDefaultBasicSalary(Number(e.target.value) || 18000)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Daily Share Rate (PHP/day)
              </label>
              <input
                type="number"
                value={defaultDailyShareRate}
                onChange={(e) =>
                  setDefaultDailyShareRate(Number(e.target.value) || 0)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={dailyShareEligible}
              onChange={(e) => setDailyShareEligible(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <span>New hire is eligible for daily physical attendance shares</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {generating
            ? "Generating 1-Hour Code..."
            : "Generate 1-Hour Enrollment Code"}
        </button>
      </form>

      {/* Right: Active & Past Enrollment Codes */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Active &amp; Recent Employee Enrollment Codes
            </h3>
            <p className="text-xs text-slate-500">
              Employees must enter an active (unexpired) code during their first
              Google signup
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Loading enrollment codes...
            </div>
          ) : codes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              No enrollment codes generated yet. Click &ldquo;Generate 1-Hour
              Enrollment Code&rdquo; on the left to create one for new
              employees.
            </div>
          ) : (
            codes.map((c) => {
              const { expired, label } = getRemainingTimeLabel(c.expires_at);
              const isUsable = !expired && !c.is_revoked;

              return (
                <div
                  key={c.id}
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isUsable ? "bg-white" : "bg-slate-50/70 opacity-75"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-lg font-extrabold tracking-wider text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                        {c.code}
                      </span>

                      {c.is_revoked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                          <XCircle className="h-3 w-3" />
                          Revoked
                        </span>
                      ) : expired ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                          <Clock className="h-3 w-3" />
                          {label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Active • {label}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600">
                      Defaults: <strong>{c.default_position}</strong> (
                      {c.default_department}) • Branch:{" "}
                      <span className="font-semibold text-emerald-800">
                        {c.branch_name || "All Branches"}
                      </span>{" "}
                      • Basic: <strong>{formatPHP(c.default_basic_salary)}</strong> •
                      Share:{" "}
                      <strong>
                        {c.daily_share_eligible
                          ? `${formatPHP(c.default_daily_share_rate)}/d`
                          : "N/A"}
                      </strong>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Created{" "}
                      {new Date(c.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      • Expires{" "}
                      {new Date(c.expires_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      • Used by <strong>{c.used_count}</strong> employee(s)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isUsable && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopy(c)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedId === c.id ? "Copied!" : "Copy Code"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(c.id)}
                          title="Revoke Code Early"
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
