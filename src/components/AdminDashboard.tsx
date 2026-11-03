"use client";

import React, { useMemo, useState } from "react";
import {
  Calculator,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Download,
  FileText,
  KeyRound,
  MapPin,
  Navigation,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  AttendanceLog,
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
import AdminEnrollmentPanel from "@/components/AdminEnrollmentPanel";
import BranchManagementPanel from "@/components/BranchManagementPanel";
import { Branch } from "@/types/hr";

interface AdminDashboardProps {
  adminUser: UserProfile;
  profiles: UserProfile[];
  branches: Branch[];
  settings: CompanySettings;
  deductionTypes: DeductionType[];
  employeeDeductions: EmployeeDeduction[];
  attendanceLogs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  payrollRecords: PayrollRecord[];
  onRefresh: () => Promise<void>;
  onSelectPayslip: (record: PayrollRecord, employee: UserProfile) => void;
}

type AdminTab =
  | "payroll"
  | "leaves"
  | "compensation"
  | "branches"
  | "enrollment"
  | "settings";

export default function AdminDashboard({
  adminUser,
  profiles,
  branches,
  settings,
  deductionTypes,
  employeeDeductions,
  attendanceLogs,
  leaveRequests,
  payrollRecords,
  onRefresh,
  onSelectPayslip,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("payroll");
  const [payMonth, setPayMonth] = useState<number>(10); // Default Oct 2026 (has rich logs & leaves)
  const [payYear, setPayYear] = useState<number>(2026);
  const [perkOverrides, setPerkOverrides] = useState<Record<string, number>>({});
  const [generatingPayroll, setGeneratingPayroll] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Special Leave Grant Form state
  const [spEmpId, setSpEmpId] = useState<string>(
    profiles.find((p) => p.role === "employee")?.id || profiles[0]?.id || ""
  );
  const [spStartDate, setSpStartDate] = useState<string>("2026-11-18");
  const [spEndDate, setSpEndDate] = useState<string>("2026-11-19");
  const [spReason, setSpReason] = useState<string>("");
  const [grantingSpecial, setGrantingSpecial] = useState<boolean>(false);

  // New Employee Modal / Form state
  const [showAddEmp, setShowAddEmp] = useState<boolean>(false);
  const [newEmpName, setNewEmpName] = useState<string>("");
  const [newEmpEmail, setNewEmpEmail] = useState<string>("");
  const [newEmpPosition, setNewEmpPosition] = useState<string>(
    "Wellness Recovery Specialist"
  );
  const [newEmpDept, setNewEmpDept] = useState<string>("Wellness & Spa");
  const [newEmpSalary, setNewEmpSalary] = useState<number>(20000);
  const [newEmpShare, setNewEmpShare] = useState<number>(380);
  const [newEmpShareEligible, setNewEmpShareEligible] = useState<boolean>(true);
  const [newEmpPerk, setNewEmpPerk] = useState<number>(1500);

  // Compensation inline edits state
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<{
    basic_salary: number;
    daily_share_rate: number;
    daily_share_eligible: boolean;
    default_performance_perk: number;
    position: string;
    deductions: Record<string, { opt_in: boolean; custom_amount: number }>;
  } | null>(null);

  // Geofence & System Settings form state
  const [geoForm, setGeoForm] = useState({
    wellness_center_name: settings.wellness_center_name,
    wellness_center_address: settings.wellness_center_address,
    center_latitude: settings.center_latitude,
    center_longitude: settings.center_longitude,
    geofence_radius_meters: settings.geofence_radius_meters,
    enforce_geofence: settings.enforce_geofence,
    working_days_per_month: settings.working_days_per_month,
  });

  const [dedTypeForm, setDedTypeForm] = useState<DeductionType[]>(
    deductionTypes.map((d) => ({ ...d }))
  );

  const pendingLeaves = useMemo(
    () => leaveRequests.filter((l) => l.status === "pending"),
    [leaveRequests]
  );

  // Live preview of payroll calculations for selected month & year
  const periodPreviewRows = useMemo(() => {
    return profiles
      .filter((p) => p.is_active)
      .map((emp) => {
        const savedRecord = payrollRecords.find(
          (r) =>
            r.employee_id === emp.id &&
            r.pay_period_month === payMonth &&
            r.pay_period_year === payYear
        );

        const liveCalc = calculateEmployeeMonthlyPayroll({
          employee: emp,
          month: payMonth,
          year: payYear,
          attendanceLogs,
          leaveRequests,
          deductionTypes,
          employeeDeductions,
          settings,
          performancePerkOverride: perkOverrides[emp.id],
          generatedByAdminId: adminUser.id,
        });

        const displayRecord: PayrollRecord = savedRecord
          ? {
              ...liveCalc,
              id: savedRecord.id,
              generated_at: savedRecord.generated_at,
            }
          : {
              ...liveCalc,
              id: `preview-${emp.id}-${payYear}-${payMonth}`,
            };

        return {
          employee: emp,
          record: displayRecord,
          isSaved: Boolean(savedRecord),
        };
      });
  }, [
    profiles,
    payrollRecords,
    payMonth,
    payYear,
    attendanceLogs,
    leaveRequests,
    deductionTypes,
    employeeDeductions,
    settings,
    perkOverrides,
    adminUser.id,
  ]);

  const handleGeneratePayroll = async () => {
    setGeneratingPayroll(true);
    setBannerMsg(null);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: payMonth,
          year: payYear,
          performancePerkOverrides: perkOverrides,
          generatedByAdminId: adminUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({
          type: "error",
          text: data.error || "Failed to generate payroll.",
        });
      } else {
        setBannerMsg({
          type: "success",
          text: data.message,
        });
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({
        type: "error",
        text: (err as Error).message,
      });
    } finally {
      setGeneratingPayroll(false);
    }
  };

  const handleDownloadAllPdfs = () => {
    periodPreviewRows.forEach(({ employee, record }) => {
      downloadPayslipPDF(record, employee, settings);
    });
  };

  const handleLeaveDecision = async (
    leaveId: string,
    status: "approved" | "rejected",
    remarks?: string
  ) => {
    setBannerMsg(null);
    try {
      const res = await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveId,
          status,
          adminRemarks: remarks,
          reviewedByAdminId: adminUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: "error", text: data.error });
      } else {
        setBannerMsg({
          type: "success",
          text: `Leave request ${status} successfully.`,
        });
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({ type: "error", text: (err as Error).message });
    }
  };

  const handleGrantSpecialLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spEmpId || !spReason.trim()) {
      setBannerMsg({
        type: "error",
        text: "Please select an employee and enter a reason for the Special Leave.",
      });
      return;
    }

    setGrantingSpecial(true);
    setBannerMsg(null);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: spEmpId,
          leaveType: "special",
          isSpecialLeave: true,
          startDate: spStartDate,
          endDate: spEndDate,
          reason: spReason.trim(),
          grantedByAdminId: adminUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: "error", text: data.error });
      } else {
        setBannerMsg({ type: "success", text: data.message });
        setSpReason("");
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({ type: "error", text: (err as Error).message });
    } finally {
      setGrantingSpecial(false);
    }
  };

  const startEditingEmployee = (emp: UserProfile) => {
    const deds: Record<string, { opt_in: boolean; custom_amount: number }> = {};
    for (const dt of deductionTypes) {
      const found = employeeDeductions.find(
        (ed) => ed.employee_id === emp.id && ed.deduction_type_id === dt.id
      );
      deds[dt.id] = {
        opt_in: Boolean(found?.opt_in),
        custom_amount: Number(found?.custom_amount ?? dt.default_amount),
      };
    }

    setEditingEmpId(emp.id);
    setEmpForm({
      basic_salary: emp.basic_salary,
      daily_share_rate: emp.daily_share_rate,
      daily_share_eligible: emp.daily_share_eligible,
      default_performance_perk: emp.default_performance_perk,
      position: emp.position,
      deductions: deds,
    });
  };

  const handleSaveEmployeeComp = async (employeeId: string) => {
    if (!empForm) return;
    setBannerMsg(null);
    try {
      const deductionUpdates = Object.entries(empForm.deductions).map(
        ([deduction_type_id, val]) => ({
          deduction_type_id,
          opt_in: val.opt_in,
          custom_amount: val.custom_amount,
        })
      );

      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          profileUpdates: {
            basic_salary: Number(empForm.basic_salary),
            daily_share_rate: Number(empForm.daily_share_rate),
            daily_share_eligible: empForm.daily_share_eligible,
            default_performance_perk: Number(empForm.default_performance_perk),
            position: empForm.position,
          },
          deductionUpdates,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: "error", text: data.error });
      } else {
        setBannerMsg({ type: "success", text: data.message });
        setEditingEmpId(null);
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({ type: "error", text: (err as Error).message });
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newEmpName,
          email: newEmpEmail,
          position: newEmpPosition,
          department: newEmpDept,
          basic_salary: newEmpSalary,
          daily_share_rate: newEmpShare,
          daily_share_eligible: newEmpShareEligible,
          default_performance_perk: newEmpPerk,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: "error", text: data.error });
      } else {
        setBannerMsg({ type: "success", text: data.message });
        setShowAddEmp(false);
        setNewEmpName("");
        setNewEmpEmail("");
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({ type: "error", text: (err as Error).message });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySettingsUpdates: {
            wellness_center_name: geoForm.wellness_center_name,
            wellness_center_address: geoForm.wellness_center_address,
            center_latitude: Number(geoForm.center_latitude),
            center_longitude: Number(geoForm.center_longitude),
            geofence_radius_meters: Number(geoForm.geofence_radius_meters),
            enforce_geofence: Boolean(geoForm.enforce_geofence),
            working_days_per_month: Number(geoForm.working_days_per_month),
          },
          deductionTypeUpdates: dedTypeForm.map((d) => ({
            id: d.id,
            default_amount: Number(d.default_amount),
            is_mandatory: Boolean(d.is_mandatory),
            is_active: Boolean(d.is_active),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: "error", text: data.error });
      } else {
        setBannerMsg({ type: "success", text: data.message });
        await onRefresh();
      }
    } catch (err) {
      setBannerMsg({ type: "error", text: (err as Error).message });
    }
  };

  const handleSetCenterToBrowserGps = () => {
    if (!("geolocation" in navigator)) {
      setBannerMsg({
        type: "error",
        text: "Geolocation is not supported in this browser.",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoForm((prev) => ({
          ...prev,
          center_latitude: Number(pos.coords.latitude.toFixed(6)),
          center_longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setBannerMsg({
          type: "success",
          text: `Wellness Center coordinates set to your current location (${pos.coords.latitude.toFixed(
            5
          )}, ${pos.coords.longitude.toFixed(5)}). Click 'Save Settings' to persist!`,
        });
      },
      (err) => {
        setBannerMsg({
          type: "error",
          text: `Could not read browser GPS: ${err.message}`,
        });
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Staff Roster</span>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {profiles.filter((p) => p.is_active).length} Employees
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {profiles.filter((p) => p.daily_share_eligible).length} eligible for
            daily attendance shares
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
            <span>Pending Leave Approvals</span>
            <CalendarCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-900">
            {pendingLeaves.length} Request(s)
          </div>
          <div className="mt-1 text-[11px] text-amber-800/80">
            Strict 3 paid leaves/quarter; excess deducts from basic
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
            <span>
              {MONTH_NAMES[payMonth - 1]} {payYear} Total Net Payroll
            </span>
            <Coins className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-900">
            {formatPHP(
              periodPreviewRows.reduce((s, r) => s + r.record.net_pay, 0)
            )}
          </div>
          <div className="mt-1 text-[11px] text-emerald-800/80">
            Includes daily shares, perks & excess leave penalties
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-800">
            <span>Wellness Center Geofence</span>
            <MapPin className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-indigo-900">
            {settings.geofence_radius_meters}m Radius
          </div>
          <div className="mt-1 text-[11px] text-indigo-800/80 font-mono">
            {settings.center_latitude.toFixed(4)},{" "}
            {settings.center_longitude.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Admin Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab("payroll")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "payroll"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Calculator className="h-4 w-4" />
          Month-End Payroll & Payslips
        </button>

        <button
          onClick={() => setActiveTab("leaves")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "leaves"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <CalendarCheck className="h-4 w-4" />
          Leave Approvals & Special Leaves
          {pendingLeaves.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.2 text-[10px] text-white">
              {pendingLeaves.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("compensation")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "compensation"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Users className="h-4 w-4" />
          Salaries, Shares &amp; Voluntary Deductions
        </button>

        <button
          onClick={() => setActiveTab("branches")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "branches"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <MapPin className="h-4 w-4" />
          Branches ({branches.length})
        </button>

        <button
          onClick={() => setActiveTab("enrollment")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "enrollment"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Employee Enrollment Codes (1-Hr)
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "settings"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Settings className="h-4 w-4" />
          GPS Geofence & Mandatory/Voluntary Rules
        </button>
      </div>

      {/* Feedback Notification Banner */}
      {bannerMsg && (
        <div
          className={`rounded-xl p-4 text-xs font-semibold flex items-center justify-between border ${
            bannerMsg.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            onClick={() => setBannerMsg(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: MONTH-END PAYROLL GENERATOR & PAYSLIPS */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Dynamic Month-End Payroll Engine & PDF Payslip Center
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically calculates days physically present, daily shares,
                  excess quarterly leave penalties (&gt;3/quarter), itemized
                  Special Leaves, and voluntary/mandatory deductions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={payMonth}
                  onChange={(e) => setPayMonth(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={payYear}
                  onChange={(e) => setPayYear(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>

                <button
                  onClick={handleGeneratePayroll}
                  disabled={generatingPayroll}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {generatingPayroll
                    ? "Generating Payslips..."
                    : `Generate ${MONTH_NAMES[payMonth - 1]} Payroll`}
                </button>

                <button
                  onClick={handleDownloadAllPdfs}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download All PDFs
                </button>
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">Employee</th>
                    <th className="py-3 px-3">Basic Salary</th>
                    <th className="py-3 px-3">Days & Shares</th>
                    <th className="py-3 px-3">Perf. Perk (Editable)</th>
                    <th className="py-3 px-3">Qtr Leaves & Excess Penalty</th>
                    <th className="py-3 px-3">Special Leaves</th>
                    <th className="py-3 px-3">SSS / PH / Ins</th>
                    <th className="py-3 px-3 text-right">Net Pay</th>
                    <th className="py-3 px-3 text-right">Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodPreviewRows.map(({ employee, record, isSaved }) => (
                    <tr key={employee.id} className="hover:bg-slate-50/90">
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900">
                          {employee.full_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {employee.employee_code} • {employee.position}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-semibold text-slate-800">
                        {formatPHP(record.basic_salary)}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-emerald-700">
                          {formatPHP(record.total_daily_shares)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {record.days_physically_present}d present{" "}
                          {employee.daily_share_eligible
                            ? `@ ₱${record.daily_share_rate}/d`
                            : "(Not eligible)"}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <input
                          type="number"
                          step="100"
                          value={
                            perkOverrides[employee.id] !== undefined
                              ? perkOverrides[employee.id]
                              : record.performance_perk
                          }
                          onChange={(e) =>
                            setPerkOverrides((prev) => ({
                              ...prev,
                              [employee.id]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </td>

                      <td className="py-3.5 px-3">
                        {record.excess_leave_days > 0 ? (
                          <div>
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                              -{formatPHP(record.excess_leave_deduction_amount)} (
                              {record.excess_leave_days} excess d)
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {record.regular_leaves_quarter_to_date} reg leaves in
                              Q{record.quarter} (Max 3)
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-600 font-medium">
                              ₱0.00 penalty
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {record.regular_leaves_quarter_to_date}/3 Q
                              {record.quarter} paid leaves used
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {record.special_leaves_count > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                            <Sparkles className="h-3 w-3" />
                            {record.special_leaves_count} day(s)
                          </span>
                        ) : (
                          <span className="text-slate-400">0 days</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {formatPHP(
                            record.sss_deduction +
                              record.philhealth_deduction +
                              record.insurance_deduction
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {[
                            record.sss_deduction > 0 ? "SSS" : null,
                            record.philhealth_deduction > 0 ? "PH" : null,
                            record.insurance_deduction > 0 ? "Ins" : null,
                          ]
                            .filter(Boolean)
                            .join(" + ") || "None opted-in"}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <div className="text-sm font-extrabold text-emerald-800">
                          {formatPHP(record.net_pay)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {isSaved ? "Finalized" : "Live Preview"}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onSelectPayslip(record, employee)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 transition"
                          >
                            <FileText className="h-3 w-3" />
                            View / Print
                          </button>
                          <button
                            onClick={() =>
                              downloadPayslipPDF(record, employee, settings)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                            title="Download PDF Payslip"
                          >
                            <Download className="h-3 w-3" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LEAVE APPROVALS & ADMIN SPECIAL LEAVES */}
      {activeTab === "leaves" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Grant Special Leave Form */}
          <form
            onSubmit={handleGrantSpecialLeave}
            className="lg:col-span-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-6 shadow-xs space-y-4 h-fit"
          >
            <div className="flex items-center gap-2 border-b border-indigo-200/60 pb-3">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-indigo-950">
                  Grant Admin Special Leave
                </h3>
                <p className="text-[11px] text-indigo-800/80">
                  Bypasses 3-day quarterly limit &amp; uniquely itemized on
                  payslip
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Employee
              </label>
              <select
                value={spEmpId}
                onChange={(e) => setSpEmpId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.employee_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={spStartDate}
                  onChange={(e) => {
                    setSpStartDate(e.target.value);
                    if (e.target.value > spEndDate) setSpEndDate(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  min={spStartDate}
                  value={spEndDate}
                  onChange={(e) => setSpEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Special Leave Authorization / Reason
              </label>
              <textarea
                rows={3}
                placeholder="e.g., Official Wellness Summit Representative / Compassionate Leave..."
                value={spReason}
                onChange={(e) => setSpReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={grantingSpecial}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {grantingSpecial
                ? "Granting Special Leave..."
                : "Grant Special Leave (Bypasses Quota)"}
            </button>
          </form>

          {/* Leave Filings List & Approval Actions */}
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  All Employee Leave Filings &amp; Special Leaves
                </h3>
                <p className="text-xs text-slate-500">
                  Approve or reject pending filings; inspect quarterly quota
                  impact
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Dates &amp; Days</th>
                    <th className="py-3 px-4">Type &amp; Qtr Quota</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4 text-right">Status / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveRequests.map((lv) => {
                    const emp = profiles.find((p) => p.id === lv.employee_id);
                    const quota = emp
                      ? calculateLeaveQuotaSummary(
                          emp,
                          leaveRequests,
                          lv.year,
                          lv.quarter,
                          settings
                        )
                      : null;

                    return (
                      <tr key={lv.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {emp?.full_name || "Employee"}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {emp?.employee_code}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {lv.start_date} → {lv.end_date}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {lv.days_count} day(s) • Q{lv.quarter} {lv.year}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {lv.is_special_leave || lv.leave_type === "special" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                              <Sparkles className="h-3 w-3" />
                              Special Leave
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 capitalize">
                                {lv.leave_type}
                              </span>
                              {quota && (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Q{lv.quarter} Approved:{" "}
                                  {quota.quarterRegularUsed}/3 days
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="text-slate-800">{lv.reason}</div>
                          {lv.admin_remarks && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5">
                              {lv.admin_remarks}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {lv.status === "pending" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  handleLeaveDecision(
                                    lv.id,
                                    "approved",
                                    "Approved by HR Admin"
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  handleLeaveDecision(
                                    lv.id,
                                    "rejected",
                                    "Declined due to scheduling"
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 transition"
                              >
                                <XCircle className="h-3 w-3" />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                                lv.status === "approved"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {lv.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SALARIES, DAILY SHARES & VOLUNTARY DEDUCTIONS */}
      {activeTab === "compensation" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Employee Base Salaries, Daily Shares &amp; Voluntary Deduction
                  Toggles
                </h2>
                <p className="text-xs text-slate-500">
                  Adjust monthly basic salaries, daily physical attendance share
                  rates, performance perks, and voluntary SSS / PhilHealth /
                  Insurance opt-ins.
                </p>
              </div>
              <button
                onClick={() => setShowAddEmp((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {showAddEmp ? "Cancel New Employee" : "Add New Employee"}
              </button>
            </div>

            {showAddEmp && (
              <form
                onSubmit={handleCreateEmployee}
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
              >
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Full Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g., Camille Bautista"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Email *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="camille@punchwellness.ph"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Position
                  </label>
                  <input
                    type="text"
                    value={newEmpPosition}
                    onChange={(e) => setNewEmpPosition(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newEmpDept}
                    onChange={(e) => setNewEmpDept(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Monthly Basic Salary (PHP)
                  </label>
                  <input
                    type="number"
                    value={newEmpSalary}
                    onChange={(e) => setNewEmpSalary(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Daily Share Rate (PHP/day)
                  </label>
                  <input
                    type="number"
                    value={newEmpShare}
                    onChange={(e) => setNewEmpShare(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Default Perf. Perk (PHP)
                  </label>
                  <input
                    type="number"
                    value={newEmpPerk}
                    onChange={(e) => setNewEmpPerk(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 py-2">
                    <input
                      type="checkbox"
                      checked={newEmpShareEligible}
                      onChange={(e) =>
                        setNewEmpShareEligible(e.target.checked)
                      }
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    Daily Share Eligible
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="mt-4 space-y-4">
              {profiles.map((emp) => {
                const isEditing = editingEmpId === emp.id;

                return (
                  <div
                    key={emp.id}
                    className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {emp.full_name}
                          </span>
                          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                            {emp.employee_code}
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                              emp.role === "admin"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {emp.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {emp.position} • {emp.department} ({emp.email})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEditing ? (
                          <button
                            onClick={() => startEditingEmployee(emp)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Modify Salary &amp; Deductions
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSaveEmployeeComp(emp.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save Changes
                            </button>
                            <button
                              onClick={() => setEditingEmpId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing ? (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <span className="text-slate-500 block">
                            Monthly Basic Salary
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatPHP(emp.basic_salary)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Daily Attendance Share
                          </span>
                          <span className="font-bold text-emerald-700">
                            {emp.daily_share_eligible
                              ? `${formatPHP(emp.daily_share_rate)} / day`
                              : "Not Eligible (Fixed)"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Default Monthly Perk
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatPHP(emp.default_performance_perk)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Voluntary Deductions Opt-In
                          </span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {deductionTypes.map((dt) => {
                              const ed = employeeDeductions.find(
                                (d) =>
                                  d.employee_id === emp.id &&
                                  d.deduction_type_id === dt.id
                              );
                              const active = dt.is_mandatory || ed?.opt_in;
                              return (
                                <span
                                  key={dt.id}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    active
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-slate-100 text-slate-400"
                                  }`}
                                >
                                  {dt.code.toUpperCase()}:{" "}
                                  {active
                                    ? `₱${ed?.custom_amount ?? dt.default_amount}`
                                    : "Off"}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      empForm && (
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="font-semibold text-slate-700 block mb-1">
                                Monthly Basic Salary (PHP)
                              </label>
                              <input
                                type="number"
                                value={empForm.basic_salary}
                                onChange={(e) =>
                                  setEmpForm({
                                    ...empForm,
                                    basic_salary: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                              />
                            </div>
                            <div>
                              <label className="font-semibold text-slate-700 block mb-1">
                                Daily Share Rate (PHP)
                              </label>
                              <input
                                type="number"
                                value={empForm.daily_share_rate}
                                onChange={(e) =>
                                  setEmpForm({
                                    ...empForm,
                                    daily_share_rate: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                              />
                            </div>
                            <div>
                              <label className="font-semibold text-slate-700 block mb-1">
                                Default Performance Perk (PHP)
                              </label>
                              <input
                                type="number"
                                value={empForm.default_performance_perk}
                                onChange={(e) =>
                                  setEmpForm({
                                    ...empForm,
                                    default_performance_perk: Number(
                                      e.target.value
                                    ),
                                  })
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                              />
                            </div>
                            <div className="flex items-end pb-1.5">
                              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={empForm.daily_share_eligible}
                                  onChange={(e) =>
                                    setEmpForm({
                                      ...empForm,
                                      daily_share_eligible: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                />
                                Eligible for Daily Shares
                              </label>
                            </div>
                          </div>

                          {/* Voluntary Deductions Per-Employee Toggles */}
                          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                            <div className="font-bold text-slate-800 mb-2">
                              Voluntary Deductions Opt-In (SSS, PhilHealth,
                              Insurance)
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {deductionTypes.map((dt) => {
                                const state = empForm.deductions[dt.id] || {
                                  opt_in: false,
                                  custom_amount: dt.default_amount,
                                };
                                return (
                                  <div
                                    key={dt.id}
                                    className="rounded-lg bg-white p-3 border border-slate-200 flex flex-col justify-between gap-2"
                                  >
                                    <label className="inline-flex items-center justify-between cursor-pointer">
                                      <span className="font-bold text-slate-900">
                                        {dt.name}
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={
                                          dt.is_mandatory || state.opt_in
                                        }
                                        disabled={dt.is_mandatory}
                                        onChange={(e) =>
                                          setEmpForm({
                                            ...empForm,
                                            deductions: {
                                              ...empForm.deductions,
                                              [dt.id]: {
                                                ...state,
                                                opt_in: e.target.checked,
                                              },
                                            },
                                          })
                                        }
                                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                      />
                                    </label>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] text-slate-500">
                                        Monthly Amount (₱):
                                      </span>
                                      <input
                                        type="number"
                                        value={state.custom_amount}
                                        onChange={(e) =>
                                          setEmpForm({
                                            ...empForm,
                                            deductions: {
                                              ...empForm.deductions,
                                              [dt.id]: {
                                                ...state,
                                                custom_amount: Number(
                                                  e.target.value
                                                ),
                                              },
                                            },
                                          })
                                        }
                                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-semibold"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3B: BRANCHES MANAGEMENT */}
      {activeTab === "branches" && (
        <BranchManagementPanel branches={branches} onRefresh={onRefresh} />
      )}

      {/* TAB 3C: EMPLOYEE ENROLLMENT CODES (1-HOUR EXPIRY) */}
      {activeTab === "enrollment" && (
        <AdminEnrollmentPanel adminUser={adminUser} settings={settings} branches={branches} />
      )}

      {/* TAB 4: GEOFENCE & VOLUNTARY/MANDATORY DEDUCTION ARCHITECTURE */}
      {activeTab === "settings" && (
        <form
          onSubmit={handleSaveSettings}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Left: Wellness Center GPS Geofence Settings */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Wellness Center GPS Coordinate Geofence
                </h3>
              </div>
              <button
                type="button"
                onClick={handleSetCenterToBrowserGps}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition"
              >
                <Navigation className="h-3 w-3" />
                Use My Current Location
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Wellness Center Name
                </label>
                <input
                  type="text"
                  value={geoForm.wellness_center_name}
                  onChange={(e) =>
                    setGeoForm({
                      ...geoForm,
                      wellness_center_name: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Wellness Center Physical Address
                </label>
                <input
                  type="text"
                  value={geoForm.wellness_center_address}
                  onChange={(e) =>
                    setGeoForm({
                      ...geoForm,
                      wellness_center_address: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Center Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geoForm.center_latitude}
                    onChange={(e) =>
                      setGeoForm({
                        ...geoForm,
                        center_latitude: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Center Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geoForm.center_longitude}
                    onChange={(e) =>
                      setGeoForm({
                        ...geoForm,
                        center_longitude: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Allowed Margin Radius (Meters)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={geoForm.geofence_radius_meters}
                    onChange={(e) =>
                      setGeoForm({
                        ...geoForm,
                        geofence_radius_meters: Number(e.target.value) || 100,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Working Days Divisor / Month
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={31}
                    value={geoForm.working_days_per_month}
                    onChange={(e) =>
                      setGeoForm({
                        ...geoForm,
                        working_days_per_month: Number(e.target.value) || 26,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 border border-slate-200 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900">
                    Enforce Strict GPS Coordinate Geofence
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Reject time-in/out API calls if employee device is outside{" "}
                    {geoForm.geofence_radius_meters}m radius
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={geoForm.enforce_geofence}
                  onChange={(e) =>
                    setGeoForm({
                      ...geoForm,
                      enforce_geofence: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
              </label>
            </div>
          </div>

          {/* Right: Voluntary vs. Mandatory Deduction Architecture */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    SSS, PhilHealth &amp; Insurance Policy Architecture
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Currently configured as <strong>Voluntary</strong> (per-employee
                  opt-in). Toggle <strong>Enforce Mandatory</strong> on any row
                  to immediately apply it across all employees.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {dedTypeForm.map((dt, idx) => (
                  <div
                    key={dt.id}
                    className="rounded-xl border border-slate-200 p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">
                          {dt.name}
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            dt.is_mandatory
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {dt.is_mandatory
                            ? "Mandatory for All Staff"
                            : "Voluntary Opt-In"}
                        </span>
                      </div>

                      <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dt.is_mandatory}
                          onChange={(e) => {
                            const next = [...dedTypeForm];
                            next[idx] = {
                              ...next[idx],
                              is_mandatory: e.target.checked,
                            };
                            setDedTypeForm(next);
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        <span>Enforce Mandatory</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-1">
                      <span className="text-slate-500">
                        Default Monthly Contribution (PHP):
                      </span>
                      <input
                        type="number"
                        value={dt.default_amount}
                        onChange={(e) => {
                          const next = [...dedTypeForm];
                          next[idx] = {
                            ...next[idx],
                            default_amount: Number(e.target.value) || 0,
                          };
                          setDedTypeForm(next);
                        }}
                        className="w-28 rounded-lg border border-slate-300 px-2.5 py-1 text-right font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Save className="h-4 w-4" />
              Save Geofence &amp; Deduction Architecture Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
