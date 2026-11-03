"use client";

import React from "react";
import {
  Award,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { CompanySettings, PayrollRecord, UserProfile } from "@/types/hr";
import { formatPHP, MONTH_NAMES } from "@/lib/payroll-engine";
import { downloadPayslipPDF } from "@/lib/pdf-payslip";

interface PayslipModalProps {
  record: PayrollRecord;
  employee: UserProfile;
  settings: CompanySettings;
  onClose: () => void;
}

export default function PayslipModal({
  record,
  employee,
  settings,
  onClose,
}: PayslipModalProps) {
  const monthName = MONTH_NAMES[record.pay_period_month - 1] || "Month";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    downloadPayslipPDF(record, employee, settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative my-8 w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden print:shadow-none print:border-none print:my-0 print:max-w-none">
        {/* Top Action Bar (hidden when printing) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <FileText className="h-4 w-4 text-emerald-600" />
            <span>
              Official Payslip Preview — {employee.full_name} ({monthName}{" "}
              {record.pay_period_year})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Payslip
            </button>
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Payslip Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[84vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {/* Payslip Header Banner */}
          <div className="rounded-xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 p-6 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">
                {settings.wellness_center_name}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mt-0.5">
                Month-End Compensation & Payslip
              </h2>
              <p className="text-xs text-emerald-100/80 mt-1">
                {settings.wellness_center_address}
              </p>
            </div>
            <div className="sm:text-right bg-white/10 rounded-lg px-4 py-2.5 backdrop-blur-xs border border-white/15">
              <div className="text-xs text-emerald-200 uppercase tracking-wider">
                Pay Period
              </div>
              <div className="text-lg font-bold">
                {monthName} {record.pay_period_year} (Q{record.quarter})
              </div>
              <div className="text-[11px] text-emerald-200">
                Status: <span className="uppercase font-semibold">{record.status}</span>
              </div>
            </div>
          </div>

          {/* Employee & Attendance Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee Name:</span>
                <span className="font-semibold text-slate-900">
                  {employee.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee ID / Code:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {employee.employee_code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Position & Dept:</span>
                <span className="font-medium text-slate-800">
                  {employee.position} ({employee.department})
                </span>
              </div>
            </div>

            <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Days Physically Present:</span>
                <span className="font-semibold text-emerald-700">
                  {record.days_physically_present} day(s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Q{record.quarter} Regular Leaves (Max 3 Paid):
                </span>
                <span className="font-medium text-slate-800">
                  {record.regular_leaves_this_month} this mo /{" "}
                  {record.regular_leaves_quarter_to_date} in Q{record.quarter} (
                  {record.paid_leaves_used_this_month} paid,{" "}
                  <span
                    className={
                      record.excess_leave_days > 0
                        ? "text-rose-600 font-bold"
                        : "text-slate-700"
                    }
                  >
                    {record.excess_leave_days} excess
                  </span>
                  )
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Admin Special Leaves Taken:
                </span>
                <span className="font-semibold text-indigo-700">
                  {record.special_leaves_count} day(s) (Bypasses Q{record.quarter} Limit)
                </span>
              </div>
            </div>
          </div>

          {/* Earnings & Deductions Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Earnings Box */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-emerald-950/5 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Earnings & Daily Shares
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Amount (PHP)
                </span>
              </div>
              <div className="divide-y divide-slate-100 p-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2 pt-1">
                  <div>
                    <div className="font-medium text-slate-900">
                      Monthly Basic Salary
                    </div>
                    <div className="text-xs text-slate-500">
                      {record.paid_leaves_used_this_month > 0
                        ? `Includes ${record.paid_leaves_used_this_month} valid paid leave day(s) keeping basic salary intact`
                        : "Full base monthly salary"}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-900 shrink-0">
                    {formatPHP(record.basic_salary)}
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2 pt-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      Daily Attendance Shares (Allowance)
                    </div>
                    <div className="text-xs text-slate-500">
                      {employee.daily_share_eligible
                        ? `${record.days_physically_present} physical days worked × ${formatPHP(
                            record.daily_share_rate
                          )}/day (leaves forfeit daily share)`
                        : "Role not eligible for daily share allowance"}
                    </div>
                  </div>
                  <div className="font-semibold text-emerald-700 shrink-0">
                    {formatPHP(record.total_daily_shares)}
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2 pt-3">
                  <div>
                    <div className="font-medium text-slate-900 flex items-center gap-1.5">
                      <span>End-of-Month Performance Perk</span>
                      <Award className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div className="text-xs text-slate-500">
                      Monthly client service & wellness performance incentive
                    </div>
                  </div>
                  <div className="font-semibold text-slate-900 shrink-0">
                    {formatPHP(record.performance_perk)}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 bg-emerald-50/70 -mx-4 -mb-4 px-4 py-3 border-t border-emerald-200">
                  <span className="font-bold text-emerald-950">
                    Gross Earnings
                  </span>
                  <span className="font-bold text-base text-emerald-800">
                    {formatPHP(record.gross_earnings)}
                  </span>
                </div>
              </div>
            </div>

            {/* Deductions Box */}
            <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="bg-rose-950/5 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-900">
                    Deductions & Leave Penalties
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Amount (PHP)
                  </span>
                </div>
                <div className="divide-y divide-slate-100 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div>
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        <span>Excess Quarterly Leave Deduction</span>
                        {record.excess_leave_days > 0 && (
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {record.excess_leave_days > 0
                          ? `${record.excess_leave_days} excess day(s) over 3-day Q${
                              record.quarter
                            } limit × ${formatPHP(
                              record.excess_leave_deduction_rate
                            )}/day (Basic ÷ ${record.working_days_divisor})`
                          : `No penalty — within 3-day Q${record.quarter} paid leave limit`}
                      </div>
                    </div>
                    <div
                      className={`font-semibold shrink-0 ${
                        record.excess_leave_days > 0
                          ? "text-rose-600"
                          : "text-slate-400"
                      }`}
                    >
                      {formatPHP(record.excess_leave_deduction_amount)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        SSS Contribution
                      </div>
                      <div className="text-xs text-slate-500">
                        {record.sss_deduction > 0
                          ? "Active deduction"
                          : "Voluntary (Not opted in)"}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {formatPHP(record.sss_deduction)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        PhilHealth Premium
                      </div>
                      <div className="text-xs text-slate-500">
                        {record.philhealth_deduction > 0
                          ? "Active deduction"
                          : "Voluntary (Not opted in)"}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {formatPHP(record.philhealth_deduction)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        Wellness Group Insurance
                      </div>
                      <div className="text-xs text-slate-500">
                        {record.insurance_deduction > 0
                          ? "Active deduction"
                          : "Voluntary (Not opted in)"}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {formatPHP(record.insurance_deduction)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-rose-50/70 border-t border-rose-200 text-sm">
                <span className="font-bold text-rose-950">Total Deductions</span>
                <span className="font-bold text-base text-rose-700">
                  {formatPHP(record.total_deductions)}
                </span>
              </div>
            </div>
          </div>

          {/* Uniquely Itemized Special Leaves Section */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-200/70 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                  Uniquely Itemized Admin-Granted Special Leaves
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-bold text-indigo-800">
                Total Special Leaves Taken: {record.special_leaves_count} day(s)
              </span>
            </div>

            {record.special_leave_details &&
            record.special_leave_details.length > 0 ? (
              <div className="mt-3 space-y-2">
                {record.special_leave_details.map((sp, i) => (
                  <div
                    key={sp.id || i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white p-3 border border-indigo-100 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Calendar className="h-4 w-4 text-indigo-600 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-900">
                          {sp.start_date} to {sp.end_date} ({sp.days_count} day
                          {sp.days_count > 1 ? "s" : ""})
                        </span>
                        <p className="text-slate-600 mt-0.5">{sp.reason}</p>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Bypasses Q{record.quarter} Quota (₱0 Basic Deduction)
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2.5 text-xs text-slate-600">
                0 Special Leaves taken during {monthName} {record.pay_period_year}.
                Admin-granted Special Leaves bypass the 3-day quarterly limit and
                keep basic salary intact.
              </p>
            )}
          </div>

          {/* Net Take-Home Pay Banner */}
          <div className="rounded-xl bg-slate-900 p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                Net Take-Home Compensation
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                Gross Earnings ({formatPHP(record.gross_earnings)}) minus Total
                Deductions ({formatPHP(record.total_deductions)})
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">
              {formatPHP(record.net_pay)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
