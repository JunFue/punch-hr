"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  MapPin,
  Navigation,
  Shield,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Branch, CompanySettings, EnrollmentCode, UserProfile } from "@/types/hr";

interface OnboardingFlowProps {
  initialRole: "admin" | "employee";
  authUser?: {
    id?: string;
    email?: string;
    fullName?: string;
  } | null;
  defaultSettings: CompanySettings;
  branches?: Branch[];
  onComplete: (profile: UserProfile) => Promise<void>;
  onCancel?: () => void;
}

export default function OnboardingFlow({
  initialRole,
  authUser,
  defaultSettings,
  branches = [],
  onComplete,
  onCancel,
}: OnboardingFlowProps) {
  const [role, setRole] = useState<"admin" | "employee">(initialRole);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Common user fields (pre-populated from Google OAuth session when available)
  const [fullName, setFullName] = useState<string>(authUser?.fullName || "");
  const [email, setEmail] = useState<string>(authUser?.email || "");

  // Admin First-Time Onboarding fields (Business Name & Details)
  const [businessName, setBusinessName] = useState<string>(
    defaultSettings.wellness_center_name || "Punch Wellness & Recovery Center"
  );
  const [branchName, setBranchName] = useState<string>("Main Branch");
  const [businessAddress, setBusinessAddress] = useState<string>(
    defaultSettings.wellness_center_address || ""
  );
  const [centerLat, setCenterLat] = useState<number>(
    defaultSettings.center_latitude || 14.5547
  );
  const [centerLng, setCenterLng] = useState<number>(
    defaultSettings.center_longitude || 121.0244
  );
  const [geofenceRadius, setGeofenceRadius] = useState<number>(
    defaultSettings.geofence_radius_meters || 100
  );
  const [workingDays, setWorkingDays] = useState<number>(
    defaultSettings.working_days_per_month || 26
  );
  const [adminPosition, setAdminPosition] = useState<string>(
    "Founder & HR Director"
  );
  const [adminDepartment, setAdminDepartment] =
    useState<string>("Management & HR");

  // Post-Admin Onboarding step: Show generated 1-hour Enrollment Code
  const [createdAdminProfile, setCreatedAdminProfile] =
    useState<UserProfile | null>(null);
  const [generatedCode, setGeneratedCode] = useState<EnrollmentCode | null>(
    null
  );
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Employee First-Time Signup fields (Requires 1-Hour Enrollment Code)
  const [enrollmentCodeInput, setEnrollmentCodeInput] = useState<string>("");
  const [verifiedCodeInfo, setVerifiedCodeInfo] =
    useState<EnrollmentCode | null>(null);
  const [verifyingCode, setVerifyingCode] = useState<boolean>(false);
  const [empPosition, setEmpPosition] = useState<string>(
    "Wellness Recovery Specialist"
  );
  const [empDepartment, setEmpDepartment] = useState<string>(
    "Operations & Therapy"
  );

  useEffect(() => {
    if (authUser?.fullName) setFullName(authUser.fullName);
    if (authUser?.email) setEmail(authUser.email);
  }, [authUser]);

  const handleUseBrowserGps = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterLat(Number(pos.coords.latitude.toFixed(6)));
        setCenterLng(Number(pos.coords.longitude.toFixed(6)));
        setError(null);
      },
      (err) => {
        setError(`Could not read browser GPS: ${err.message}`);
      }
    );
  };

  const handleVerifyEnrollmentCode = async () => {
    if (!enrollmentCodeInput.trim()) {
      setError("Please enter the 1-hour Enrollment Code from your Admin.");
      return;
    }
    setVerifyingCode(true);
    setError(null);
    setVerifiedCodeInfo(null);
    try {
      const res = await fetch(
        `/api/enrollment?code=${encodeURIComponent(
          enrollmentCodeInput.trim().toUpperCase()
        )}`
      );
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || "Invalid or expired enrollment code.");
      } else {
        setVerifiedCodeInfo(data.codeRecord);
        if (data.codeRecord.default_position) {
          setEmpPosition(data.codeRecord.default_position);
        }
        if (data.codeRecord.default_department) {
          setEmpDepartment(data.codeRecord.default_department);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "admin",
          authUserId: authUser?.id,
          email: email.trim(),
          fullName: fullName.trim(),
          position: adminPosition.trim(),
          department: adminDepartment.trim(),
          businessName: businessName.trim(),
          branchName: branchName.trim(),
          businessAddress: businessAddress.trim(),
          centerLatitude: centerLat,
          centerLongitude: centerLng,
          geofenceRadiusMeters: geofenceRadius,
          workingDaysPerMonth: workingDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Admin onboarding failed.");
      } else {
        setCreatedAdminProfile(data.profile);
        setGeneratedCode(data.enrollmentCode);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "employee",
          authUserId: authUser?.id,
          email: email.trim(),
          fullName: fullName.trim(),
          enrollmentCode: enrollmentCodeInput.trim().toUpperCase(),
          position: empPosition.trim(),
          department: empDepartment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Employee signup failed.");
      } else {
        await onComplete(data.profile);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Post-Admin Onboarding Success View showing the newly generated 1-hour Enrollment Code
  if (createdAdminProfile && generatedCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl border border-slate-200 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Admin Onboarding Complete
              </span>
              <h2 className="text-lg font-extrabold text-slate-900">
                {generatedCode.business_name}
              </h2>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                Employee First-Signup Enrollment Code
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                <Clock className="h-3 w-3" />
                Expires in 1 Hour
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3.5 border border-emerald-200 shadow-xs">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-slate-900">
                {generatedCode.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedCode.code);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedCode ? "Copied!" : "Copy Code"}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Share this code with your employees so they can complete their
              first-time Google signup. This code will automatically expire at{" "}
              <strong>
                {new Date(generatedCode.expires_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>{" "}
              (within 1 hour). You can generate new 1-hour codes anytime from
              your Admin Dashboard.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onComplete(createdAdminProfile)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
          >
            <span>Enter Admin Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                First-Time Account Onboarding
              </h1>
              <p className="text-xs text-slate-500">
                Complete your initial setup as an Admin (Business Setup) or
                Employee (with 1-Hour Enrollment Code)
              </p>
            </div>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Back to Login
            </button>
          )}
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setRole("admin");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
              role === "admin"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            1. Admin Business Onboarding
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("employee");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
              role === "employee"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            2. Employee Signup (Enrollment Code)
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        {role === "admin" ? (
          <form onSubmit={handleAdminSubmit} className="space-y-4 text-xs">
            <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-3.5 text-emerald-950">
              <div className="font-bold flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-emerald-700" />
                <span>Admin First-Time Business &amp; Geofence Setup</span>
              </div>
              <p className="mt-0.5 text-[11px] text-emerald-800">
                Fill out your business details below. Once completed, Punch-HR
                will generate a 1-hour Enrollment Code for your employees.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Your Full Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g., Clarisse Reyes"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Google Account Email *
                </label>
                <input
                  required
                  type="email"
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Business / Wellness Center Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g., Punch Wellness & Recovery Center"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Initial / Headquarters Branch Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g., Main Branch or Makati Branch"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Your Admin Title / Position *
                </label>
                <input
                  required
                  type="text"
                  value={adminPosition}
                  onChange={(e) => setAdminPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Department
                </label>
                <input
                  required
                  type="text"
                  value={adminDepartment}
                  onChange={(e) => setAdminDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Business Physical Address *
              </label>
              <input
                required
                type="text"
                placeholder="Street, Building, City, Province"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>

            {/* GPS Geofence Setup */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  Wellness Center GPS Check-In Coordinates
                </span>
                <button
                  type="button"
                  onClick={handleUseBrowserGps}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                >
                  <Navigation className="h-3 w-3" />
                  Use My Current Location
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={centerLat}
                    onChange={(e) =>
                      setCenterLat(parseFloat(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={centerLng}
                    onChange={(e) =>
                      setCenterLng(parseFloat(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Radius (Meters)
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={geofenceRadius}
                    onChange={(e) =>
                      setGeofenceRadius(Number(e.target.value) || 100)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Work Days / Mo
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={31}
                    value={workingDays}
                    onChange={(e) =>
                      setWorkingDays(Number(e.target.value) || 26)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              {submitting
                ? "Completing Admin Setup..."
                : "Complete Business Onboarding & Generate 1-Hour Enrollment Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmployeeSubmit} className="space-y-4 text-xs">
            <div className="rounded-xl bg-indigo-50/60 border border-indigo-200 p-3.5 text-indigo-950">
              <div className="font-bold flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                <span>Employee First-Time Signup (Requires 1-Hour Code)</span>
              </div>
              <p className="mt-0.5 text-[11px] text-indigo-800">
                Enter the 1-hour Enrollment Code provided by your HR Admin to
                link your Google account to your workplace profile.
              </p>
            </div>

            {/* Enrollment Code Input + Live Validator */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Admin Enrollment Code (Expires within 1 Hour) *
              </label>
              <div className="flex gap-2">
                <input
                  required
                  type="text"
                  placeholder="e.g., PUNCH-7K9M2X"
                  value={enrollmentCodeInput}
                  onChange={(e) =>
                    setEnrollmentCodeInput(e.target.value.toUpperCase())
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm font-bold tracking-wider uppercase text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleVerifyEnrollmentCode}
                  disabled={verifyingCode}
                  className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 transition"
                >
                  {verifyingCode ? "Checking..." : "Verify Code"}
                </button>
              </div>
            </div>

            {verifiedCodeInfo && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between text-emerald-950">
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      Valid Code for {verifiedCodeInfo.business_name}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    Branch: <strong>{verifiedCodeInfo.branch_name || "Headquarters"}</strong> • Issued by {verifiedCodeInfo.created_by_name} • Expires at{" "}
                    {new Date(verifiedCodeInfo.expires_at).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </div>
                </div>
                <span className="rounded-full bg-emerald-200/70 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900">
                  Verified
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Your Full Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g., Marco Santos"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Google Account Email *
                </label>
                <input
                  required
                  type="email"
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Job Title / Position
                </label>
                <input
                  type="text"
                  value={empPosition}
                  onChange={(e) => setEmpPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              {submitting
                ? "Verifying Enrollment Code & Creating Profile..."
                : "Complete Employee Signup with Enrollment Code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
