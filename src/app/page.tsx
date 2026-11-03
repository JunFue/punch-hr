"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Database,
  KeyRound,
  LogOut,
  RotateCcw,
  Shield,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { DemoDatabaseState } from "@/lib/data-store";
import { PayrollRecord, UserProfile } from "@/types/hr";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AdminDashboard from "@/components/AdminDashboard";
import EmployeeDashboard from "@/components/EmployeeDashboard";
import PayslipModal from "@/components/PayslipModal";
import OnboardingFlow from "@/components/OnboardingFlow";

export default function PunchHrApp() {
  const [systemMode, setSystemMode] = useState<"demo" | "supabase">("demo");
  const [dbState, setDbState] = useState<DemoDatabaseState | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Google Auth & First-Time Onboarding state
  const [showLoginScreen, setShowLoginScreen] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [loginRoleTab, setLoginRoleTab] = useState<"admin" | "employee">(
    "admin"
  );
  const [oauthUser, setOauthUser] = useState<{
    id?: string;
    email?: string;
    fullName?: string;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

  // Active Payslip Modal state
  const [selectedPayslip, setSelectedPayslip] = useState<{
    record: PayrollRecord;
    employee: UserProfile;
  } | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const payload = await res.json();
      if (payload?.data) {
        setSystemMode(payload.mode || "demo");
        setDbState(payload.data);

        // Check if there is an active Supabase Google OAuth session
        const supabase = createSupabaseBrowserClient();
        if (supabase) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user && user.email) {
            const matchedProfile = payload.data.profiles.find(
              (p: UserProfile) =>
                p.id === user.id ||
                p.email.toLowerCase() === user.email!.toLowerCase()
            );

            if (matchedProfile) {
              setCurrentUser(matchedProfile);
              setShowOnboarding(false);
              setShowLoginScreen(false);
              return;
            } else {
              // Authenticated via Google OAuth for the first time!
              // Require onboarding (Admin business setup OR Employee 1-hour enrollment code)
              const intendedRole =
                (typeof window !== "undefined" &&
                  (localStorage.getItem("punch_hr_intended_role") as
                    | "admin"
                    | "employee")) ||
                "admin";
              setLoginRoleTab(intendedRole);
              setOauthUser({
                id: user.id,
                email: user.email,
                fullName:
                  user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  "",
              });
              setShowOnboarding(true);
              setShowLoginScreen(false);
              return;
            }
          }
        }

        setCurrentUser((prev) => {
          if (prev) {
            return (
              payload.data.profiles.find(
                (p: UserProfile) => p.id === prev.id
              ) || payload.data.profiles[0]
            );
          }
          return payload.data.profiles[0] || null;
        });
      }
    } catch (err) {
      console.error("Failed to fetch Punch-HR state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleGoogleSignIn = async (intendedRole: "admin" | "employee") => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("punch_hr_intended_role", intendedRole);
      }

      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        // Fallback to onboarding screen if Supabase client is not configured
        setLoginRoleTab(intendedRole);
        setShowOnboarding(true);
        setShowLoginScreen(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        setAuthError(
          `Google OAuth message: ${error.message}. (Ensure Google provider is enabled in Supabase Dashboard → Authentication → Providers, or click "First-Time Onboarding" below to proceed.)`
        );
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/state", { method: "DELETE" });
      const payload = await res.json();
      if (payload?.data) {
        setDbState(payload.data);
        setCurrentUser(payload.data.profiles[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading || !dbState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center animate-pulse">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div className="text-sm font-semibold tracking-wide">
            Loading Punch-HR Wellness &amp; Payroll Platform...
          </div>
        </div>
      </div>
    );
  }

  // First-Time Onboarding Flow (Admin Business Setup OR Employee 1-Hour Enrollment Code Signup)
  if (showOnboarding) {
    return (
      <OnboardingFlow
        initialRole={loginRoleTab}
        authUser={oauthUser}
        defaultSettings={dbState.companySettings}
        branches={dbState.branches || []}
        onComplete={async (newProfile) => {
          await loadState();
          setCurrentUser(newProfile);
          setShowOnboarding(false);
          setShowLoginScreen(false);
        }}
        onCancel={() => {
          setShowOnboarding(false);
        }}
      />
    );
  }

  // Google Sign-In / Sign-Up Screen
  if (showLoginScreen || !currentUser) {
    const filteredProfiles = dbState.profiles.filter(
      (p) => p.role === loginRoleTab
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl border border-slate-200 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                Punch-HR Portal
              </h1>
              <p className="text-xs text-slate-500">
                {dbState.companySettings.wellness_center_name}
              </p>
            </div>
          </div>

          {/* Dual-Role Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setLoginRoleTab("admin");
                setAuthError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
                loginRoleTab === "admin"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              1. Admin Login / Signup
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginRoleTab("employee");
                setAuthError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
                loginRoleTab === "employee"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              2. Employee Login / Signup
            </button>
          </div>

          {/* Primary Google OAuth Login / Signup CTA */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={googleLoading}
              onClick={() => handleGoogleSignIn(loginRoleTab)}
              className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3.5 text-xs font-extrabold text-slate-800 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {googleLoading
                  ? "Redirecting to Google..."
                  : `Continue with Google as ${
                      loginRoleTab === "admin" ? "Admin" : "Employee"
                    }`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowOnboarding(true);
                setShowLoginScreen(false);
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              {loginRoleTab === "admin" ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>
                    First-Time Admin Onboarding (Setup Business &amp; 1-Hr Code)
                  </span>
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>
                    First-Time Employee Signup (Enter 1-Hour Enrollment Code)
                  </span>
                </>
              )}
            </button>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 leading-relaxed">
              {loginRoleTab === "admin" ? (
                <>
                  <strong>Admin Onboarding Policy:</strong> First-time Admin
                  signups require filling out your Business Name, Address, and
                  GPS Geofence settings, and generate a{" "}
                  <strong>1-hour Enrollment Code</strong> for your staff.
                </>
              ) : (
                <>
                  <strong>Employee Signup Policy:</strong> First-time Employee
                  signups require a valid{" "}
                  <strong>1-hour Enrollment Code</strong> generated by your
                  Admin.
                </>
              )}
            </div>
          </div>

          {authError && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 font-medium">
              {authError}
            </div>
          )}

          {/* Existing Onboarded Accounts Quick Switcher */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Existing Onboarded {loginRoleTab} Accounts
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {filteredProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setCurrentUser(p);
                    setShowLoginScreen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-xs hover:bg-emerald-50 hover:border-emerald-200 transition"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {p.full_name}{" "}
                      <span className="font-mono text-[11px] text-slate-500">
                        ({p.employee_code})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {p.position} • {p.email}
                    </div>
                  </div>
                  <span className="text-emerald-700 font-bold text-[11px]">
                    Enter →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Application Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs print:hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  Punch-HR
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    currentUser.role === "admin"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {currentUser.role === "admin"
                    ? "Admin Portal"
                    : "Employee Portal"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {dbState.companySettings.wellness_center_name}
              </p>
            </div>
          </div>

          {/* Right Controls: Role Switcher, Onboarding Trigger, DB Mode & Sign Out */}
          <div className="flex items-center gap-2">
            {/* Database Mode Indicator */}
            <span
              className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
              title="Connected to live Supabase PostgreSQL database"
            >
              <Database className="h-3 w-3 text-emerald-600" />
              {systemMode === "supabase" ? "Supabase Live" : "Demo Mode"}
            </span>

            {/* Instant Dual-Role Account Switcher */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1">
              <Users className="h-3.5 w-3.5 text-slate-500 hidden sm:block" />
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const selected = dbState.profiles.find(
                    (p) => p.id === e.target.value
                  );
                  if (selected) setCurrentUser(selected);
                }}
                aria-label="Switch user role or account"
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <optgroup label="1. Admin Role (Global HR & Payroll)">
                  {dbState.profiles
                    .filter((p) => p.role === "admin")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        👑 {p.full_name} ({p.employee_code} — Admin)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="2. Employee Role (Personal Attendance, Leaves & Payslips)">
                  {dbState.profiles
                    .filter((p) => p.role === "employee")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        👤 {p.full_name} ({p.employee_code})
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            <button
              onClick={() => {
                setLoginRoleTab(currentUser.role);
                setShowOnboarding(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
              title="Open First-Time Admin Business Onboarding or Employee 1-Hour Enrollment Code Signup"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Onboarding / Enroll</span>
            </button>

            {systemMode === "demo" && (
              <button
                onClick={handleResetDemo}
                title="Reset Demo Data to Initial State"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              onClick={async () => {
                const supabase = createSupabaseBrowserClient();
                if (supabase) {
                  await supabase.auth.signOut();
                }
                setLoginRoleTab(currentUser.role);
                setShowLoginScreen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Google Login</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 print:hidden">
        {currentUser.role === "admin" ? (
          <AdminDashboard
            adminUser={currentUser}
            profiles={dbState.profiles}
            branches={dbState.branches || []}
            settings={dbState.companySettings}
            deductionTypes={dbState.deductionTypes}
            employeeDeductions={dbState.employeeDeductions}
            attendanceLogs={dbState.attendanceLogs}
            leaveRequests={dbState.leaveRequests}
            payrollRecords={dbState.payrollRecords}
            onRefresh={loadState}
            onSelectPayslip={(record, employee) =>
              setSelectedPayslip({ record, employee })
            }
          />
        ) : (
          <EmployeeDashboard
            employee={currentUser}
            settings={dbState.companySettings}
            branches={dbState.branches || []}
            deductionTypes={dbState.deductionTypes}
            employeeDeductions={dbState.employeeDeductions}
            attendanceLogs={dbState.attendanceLogs}
            leaveRequests={dbState.leaveRequests}
            payrollRecords={dbState.payrollRecords}
            onRefresh={loadState}
            onSelectPayslip={(record, employee) =>
              setSelectedPayslip({ record, employee })
            }
          />
        )}
      </main>

      {/* Payslip Preview / Print / PDF Modal */}
      {selectedPayslip && (
        <PayslipModal
          record={selectedPayslip.record}
          employee={selectedPayslip.employee}
          settings={dbState.companySettings}
          onClose={() => setSelectedPayslip(null)}
        />
      )}
    </div>
  );
}
