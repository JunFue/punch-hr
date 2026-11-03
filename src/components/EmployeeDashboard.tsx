"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Download,
  FileText,
  Save,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  AttendanceLog,
  Branch,
  CompanySettings,
  DeductionType,
  EmployeeDeduction,
  LeaveRequest,
  PayrollRecord,
  UserProfile,
} from "@/types/hr";
import {
  calculateEmployeeMonthlyPayroll,
  calculateLeaveQuotaSummary,
  formatPHP,
  MONTH_NAMES,
} from "@/lib/payroll-engine";
import { downloadPayslipPDF } from "@/lib/pdf-payslip";
import GpsAttendanceCard from "@/components/GpsAttendanceCard";
import EmployeeLeavesView from "@/components/EmployeeLeavesView";

interface EmployeeDashboardProps {
  employee: UserProfile;
  settings: CompanySettings;
  branches?: Branch[];
  deductionTypes: DeductionType[];
  employeeDeductions: EmployeeDeduction[];
  attendanceLogs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  payrollRecords: PayrollRecord[];
  onRefresh: () => Promise<void>;
  onSelectPayslip: (record: PayrollRecord, employee: UserProfile) => void;
}

type EmployeeTab = "attendance" | "leaves" | "payslips";

export default function EmployeeDashboard({
  employee,
  settings,
  branches = [],
  deductionTypes,
  employeeDeductions,
  attendanceLogs,
  leaveRequests,
  payrollRecords,
  onRefresh,
  onSelectPayslip,
}: EmployeeDashboardProps) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("attendance");
  const [savingDeductions, setSavingDeductions] = useState<boolean>(false);
  const [dedMsg, setDedMsg] = useState<string | null>(null);

  const [myOptIns, setMyOptIns] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const dt of deductionTypes) {
      const ed = employeeDeductions.find(
        (d) => d.employee_id === employee.id && d.deduction_type_id === dt.id
      );
      map[dt.id] = Boolean(ed?.opt_in);
    }
    return map;
  });

  const quotaQ4 = useMemo(
    () =>
      calculateLeaveQuotaSummary(employee, leaveRequests, 2026, 4, settings),
    [employee, leaveRequests, settings]
  );

  const myPayslips = useMemo(() => {
    const saved = payrollRecords
      .filter((r) => r.employee_id === employee.id)
      .sort(
        (a, b) =>
          b.pay_period_year - a.pay_period_year ||
          b.pay_period_month - a.pay_period_month
      );

    // Also provide a live November 2026 projection if not yet finalized
    const hasNov2026 = saved.some(
      (r) => r.pay_period_year === 2026 && r.pay_period_month === 11
    );

    if (!hasNov2026) {
      const novPreview = calculateEmployeeMonthlyPayroll({
        employee,
        month: 11,
        year: 2026,
        attendanceLogs,
        leaveRequests,
        deductionTypes,
        employeeDeductions,
        settings,
      });
      return [
        {
          ...novPreview,
          id: `preview-nov-2026-${employee.employee_code}`,
          status: "draft" as const,
        },
        ...saved,
      ];
    }

    return saved;
  }, [
    payrollRecords,
    employee,
    attendanceLogs,
    leaveRequests,
    deductionTypes,
    employeeDeductions,
    settings,
  ]);

  const handleSaveVoluntaryDeductions = async () => {
    setSavingDeductions(true);
    setDedMsg(null);
    try {
      const deductionUpdates = deductionTypes.map((dt) => ({
        deduction_type_id: dt.id,
        opt_in: Boolean(myOptIns[dt.id]),
      }));

      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          deductionUpdates,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDedMsg("Your voluntary deduction preferences have been updated.");
        await onRefresh();
      } else {
        setDedMsg(data.error || "Failed to update deductions.");
      }
    } finally {
      setSavingDeductions(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Personal Summary Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-0.5 text-xs font-semibold text-emerald-300">
            <span>{employee.employee_code}</span>
            <span>•</span>
            <span>{employee.department}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mt-2">
            Welcome back, {employee.full_name}
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">{employee.position}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-white/10 px-4 py-2.5 border border-white/10">
            <div className="text-slate-300">Monthly Basic</div>
            <div className="text-base font-bold text-white mt-0.5">
              {formatPHP(employee.basic_salary)}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-2.5 border border-white/10">
            <div className="text-slate-300">Daily Share Rate</div>
            <div className="text-base font-bold text-emerald-300 mt-0.5">
              {employee.daily_share_eligible
                ? `${formatPHP(employee.daily_share_rate)}/day`
                : "Not Eligible"}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-2.5 border border-white/10 col-span-2 sm:col-span-1">
            <div className="text-slate-300">Q4 Paid Leaves Left</div>
            <div className="text-base font-bold text-white mt-0.5">
              {quotaQ4.quarterRegularRemaining} / {quotaQ4.quarterlyLimit} days
            </div>
          </div>
        </div>
      </div>

      {/* Employee Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab("attendance")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "attendance"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Clock className="h-4 w-4" />
          Daily GPS Time-In / Out &amp; Shares
        </button>

        <button
          onClick={() => setActiveTab("leaves")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "leaves"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Leave Filing &amp; Quarterly Quota
        </button>

        <button
          onClick={() => setActiveTab("payslips")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "payslips"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Wallet className="h-4 w-4" />
          My Payslips &amp; Voluntary Deductions
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "attendance" && (
        <GpsAttendanceCard
          employee={employee}
          settings={settings}
          branches={branches}
          attendanceLogs={attendanceLogs}
          onRefresh={onRefresh}
        />
      )}

      {activeTab === "leaves" && (
        <EmployeeLeavesView
          employee={employee}
          settings={settings}
          leaveRequests={leaveRequests}
          onRefresh={onRefresh}
        />
      )}

      {activeTab === "payslips" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Payslips List */}
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                My Monthly Payslips &amp; Compensation Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                View or download official PDF payslips detailing basic salary,
                daily shares, performance perks, excess leave deductions, and
                itemized Special Leaves
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {myPayslips.map((rec) => {
                const mName = MONTH_NAMES[rec.pay_period_month - 1];
                return (
                  <div
                    key={rec.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {mName} {rec.pay_period_year} (Q{rec.quarter})
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            rec.status === "finalized"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {rec.status === "finalized"
                            ? "Finalized Payslip"
                            : "Live Month-to-Date"}
                        </span>
                        {rec.special_leaves_count > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800">
                            <Sparkles className="h-3 w-3" />
                            {rec.special_leaves_count} Special Leave(s) Itemized
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Present:{" "}
                          <strong>{rec.days_physically_present}d</strong>
                        </span>
                        <span>
                          Daily Shares:{" "}
                          <strong className="text-emerald-700">
                            {formatPHP(rec.total_daily_shares)}
                          </strong>
                        </span>
                        <span>
                          Gross: <strong>{formatPHP(rec.gross_earnings)}</strong>
                        </span>
                        <span>
                          Deductions:{" "}
                          <strong className="text-rose-600">
                            -{formatPHP(rec.total_deductions)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-slate-400 font-semibold">
                          Net Pay
                        </div>
                        <div className="text-base font-extrabold text-emerald-800">
                          {formatPHP(rec.net_pay)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onSelectPayslip(rec, employee)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          onClick={() =>
                            downloadPayslipPDF(rec, employee, settings)
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Voluntary Deductions Opt-In Panel */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4 h-fit">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Voluntary Deductions Opt-In
                </h3>
                <p className="text-[11px] text-slate-500">
                  Toggle your optional SSS, PhilHealth &amp; Insurance
                  contributions
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {deductionTypes.map((dt) => {
                const ed = employeeDeductions.find(
                  (d) =>
                    d.employee_id === employee.id &&
                    d.deduction_type_id === dt.id
                );
                const amount = ed?.custom_amount ?? dt.default_amount;
                const checked = dt.is_mandatory || Boolean(myOptIns[dt.id]);

                return (
                  <label
                    key={dt.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{dt.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatPHP(amount)} / month •{" "}
                        {dt.is_mandatory ? "Mandatory" : "Voluntary Opt-In"}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={dt.is_mandatory}
                      onChange={(e) =>
                        setMyOptIns((prev) => ({
                          ...prev,
                          [dt.id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                  </label>
                );
              })}
            </div>

            {dedMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-medium">
                {dedMsg}
              </div>
            )}

            <button
              onClick={handleSaveVoluntaryDeductions}
              disabled={savingDeductions}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingDeductions
                ? "Saving Preferences..."
                : "Save Voluntary Deduction Toggles"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
