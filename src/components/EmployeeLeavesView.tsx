"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle,
} from "lucide-react";
import { CompanySettings, LeaveRequest, LeaveType, UserProfile } from "@/types/hr";
import {
  calculateLeaveQuotaSummary,
  formatPHP,
  getQuarterFromMonth,
  round2,
} from "@/lib/payroll-engine";

interface EmployeeLeavesViewProps {
  employee: UserProfile;
  settings: CompanySettings;
  leaveRequests: LeaveRequest[];
  onRefresh: () => Promise<void>;
}

export default function EmployeeLeavesView({
  employee,
  settings,
  leaveRequests,
  onRefresh,
}: EmployeeLeavesViewProps) {
  const [leaveType, setLeaveType] = useState<LeaveType>("regular");
  const [startDate, setStartDate] = useState<string>("2026-11-16");
  const [endDate, setEndDate] = useState<string>("2026-11-16");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedYear = parseInt(startDate.split("-")[0] || "2026", 10);
  const selectedMonth = parseInt(startDate.split("-")[1] || "11", 10);
  const selectedQuarter = getQuarterFromMonth(selectedMonth);

  const quota = useMemo(
    () =>
      calculateLeaveQuotaSummary(
        employee,
        leaveRequests,
        selectedYear,
        selectedQuarter,
        settings
      ),
    [employee, leaveRequests, selectedYear, selectedQuarter, settings]
  );

  const requestedDays = useMemo(() => {
    const s = new Date(`${startDate}T00:00:00Z`);
    const e = new Date(`${endDate}T00:00:00Z`);
    const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff || 1);
  }, [startDate, endDate]);

  const dailyBasicDeductionRate = useMemo(
    () =>
      round2(
        employee.basic_salary / (settings.working_days_per_month || 26)
      ),
    [employee.basic_salary, settings.working_days_per_month]
  );

  const projectedExcessDays = Math.max(
    0,
    requestedDays - quota.quarterRegularRemaining
  );
  const projectedPenalty = round2(
    projectedExcessDays * dailyBasicDeductionRate
  );

  const myLeaves = useMemo(
    () =>
      leaveRequests
        .filter((l) => l.employee_id === employee.id)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [leaveRequests, employee.id]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setMessage({
        type: "error",
        text: "Please enter a reason for your leave filing.",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          leaveType,
          isSpecialLeave: false,
          startDate,
          endDate,
          daysCount: requestedDays,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to file leave.",
        });
      } else {
        setMessage({
          type: "success",
          text: data.message,
        });
        setReason("");
        await onRefresh();
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Quota Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Q{quota.quarter} {quota.year} Paid Leave Quota
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">
              { Math.min(quota.quarterRegularUsed, quota.quarterlyLimit) } /{" "}
              {quota.quarterlyLimit} days
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              {quota.quarterRegularRemaining} paid left
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Strict max of {quota.quarterlyLimit} paid leave days per quarter.
            Keeps basic salary intact; forfeits daily share.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Annual Leave Allocation ({quota.year})
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">
              {quota.annualRegularUsed} / {quota.annualLimit} days
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {quota.annualRegularRemaining} annual left
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            12 total paid leave days per year (3 days × 4 quarters).
          </p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-xs">
          <div className="text-xs font-semibold text-rose-800">
            Q{quota.quarter} Excess Leave Days (&gt;3 Limit)
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-rose-700">
              {quota.quarterExcessDays} day(s)
            </span>
            <span className="text-xs font-semibold text-rose-700">
              {formatPHP(quota.quarterExcessDays * dailyBasicDeductionRate)}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-rose-700/85">
            Excess days deduct {formatPHP(dailyBasicDeductionRate)}/day from
            basic salary (Basic ÷ {settings.working_days_per_month}).
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-xs">
          <div className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Special Leaves Granted</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-indigo-800">
              {quota.specialLeavesYearToDate} day(s)
            </span>
            <span className="text-xs font-semibold text-indigo-700">
              ₱0 Penalty
            </span>
          </div>
          <p className="mt-2 text-[11px] text-indigo-800/80">
            Admin-granted Special Leaves bypass quarterly limits and are
            uniquely itemized on your payslip.
          </p>
        </div>
      </div>

      {/* Leave Filing Form & Policy Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CalendarPlus className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              File a Leave Application
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Leave Category
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="regular">Regular Vacation / Personal Leave</option>
              <option value="sick">Medical / Sick Leave</option>
              <option value="emergency">Emergency Leave</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                End Date
              </label>
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Live Impact Preview */}
          <div
            className={`rounded-xl p-3.5 text-xs border ${
              projectedExcessDays > 0
                ? "bg-amber-50 border-amber-200 text-amber-950"
                : "bg-emerald-50 border-emerald-200 text-emerald-950"
            }`}
          >
            <div className="font-bold flex items-center justify-between">
              <span>Requested Duration: {requestedDays} day(s)</span>
              <span>Quarter: Q{selectedQuarter}</span>
            </div>
            {projectedExcessDays > 0 ? (
              <p className="mt-1 text-[11px] leading-relaxed">
                <AlertTriangle className="inline h-3.5 w-3.5 text-amber-600 mr-1" />
                You have <strong>{quota.quarterRegularRemaining}</strong> paid
                leave day(s) left in Q{selectedQuarter}.{" "}
                <strong>{projectedExcessDays} excess day(s)</strong> will
                trigger a basic salary deduction of{" "}
                <strong>{formatPHP(projectedPenalty)}</strong> upon approval.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed">
                Within your 3-day Q{selectedQuarter} paid leave limit! Your
                monthly basic salary ({formatPHP(employee.basic_salary)}) stays
                intact, while daily shares are forfeited for the leave day(s).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Reason for Leave
            </label>
            <textarea
              rows={3}
              placeholder="Provide details for HR/Admin review..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {message && (
            <div
              className={`rounded-lg p-3 text-xs font-medium ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
          >
            {submitting ? "Submitting Leave Request..." : "Submit Leave Filing"}
          </button>
        </form>

        {/* Leave History Table */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              My Leave Filings & Special Leaves History
            </h3>
            <p className="text-xs text-slate-500">
              Includes regular leave requests and Admin-granted Special Leaves
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Dates & Quarter</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason & Remarks</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myLeaves.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-slate-400 italic"
                    >
                      No leave requests found.
                    </td>
                  </tr>
                ) : (
                  myLeaves.map((lv) => (
                    <tr key={lv.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {lv.start_date} → {lv.end_date}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Q{lv.quarter} {lv.year}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {lv.is_special_leave || lv.leave_type === "special" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                            <Sparkles className="h-3 w-3" />
                            Special Leave
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 capitalize">
                            {lv.leave_type}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {lv.days_count}d
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-800">{lv.reason}</div>
                        {lv.admin_remarks && (
                          <div className="text-[11px] text-slate-500 mt-0.5 italic">
                            HR Note: {lv.admin_remarks}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {lv.status === "approved" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Approved
                          </span>
                        )}
                        {lv.status === "pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                            <Clock className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                        {lv.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                            <XCircle className="h-3 w-3" />
                            Rejected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
