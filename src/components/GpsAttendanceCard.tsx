"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  Compass,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Coins,
} from "lucide-react";
import { AttendanceLog, Branch, CompanySettings, UserProfile } from "@/types/hr";
import { calculateHaversineDistanceMeters } from "@/lib/geo";
import { formatPHP } from "@/lib/payroll-engine";

interface GpsAttendanceCardProps {
  employee: UserProfile;
  settings: CompanySettings;
  branches?: Branch[];
  attendanceLogs: AttendanceLog[];
  onRefresh: () => Promise<void>;
}

export default function GpsAttendanceCard({
  employee,
  settings,
  branches = [],
  attendanceLogs,
  onRefresh,
}: GpsAttendanceCardProps) {
  const activeBranch = useMemo(() => {
    if (employee.branch_id && branches.length > 0) {
      const found = branches.find((b) => b.id === employee.branch_id);
      if (found) return found;
    }
    return branches[0] || null;
  }, [employee.branch_id, branches]);

  const targetName = activeBranch ? activeBranch.name : settings.wellness_center_name;
  const targetLat = activeBranch ? activeBranch.center_latitude : settings.center_latitude;
  const targetLng = activeBranch ? activeBranch.center_longitude : settings.center_longitude;
  const targetRadius = activeBranch ? activeBranch.geofence_radius_meters : settings.geofence_radius_meters;

  // Default coordinates slightly offset (~14m) from Wellness Center/Branch
  const [lat, setLat] = useState<number>(
    Number((targetLat + 0.0001).toFixed(6))
  );
  const [lng, setLng] = useState<number>(
    Number((targetLng + 0.00008).toFixed(6))
  );
  const [gpsSource, setGpsSource] = useState<
    "wellness_preset" | "browser_gps" | "outside_preset" | "custom"
  >("wellness_preset");
  const [workDate, setWorkDate] = useState<string>("2026-11-03");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const myLogs = useMemo(
    () =>
      attendanceLogs
        .filter((l) => l.employee_id === employee.id)
        .sort((a, b) => b.work_date.localeCompare(a.work_date)),
    [attendanceLogs, employee.id]
  );

  const selectedDateLog = useMemo(
    () => myLogs.find((l) => l.work_date === workDate),
    [myLogs, workDate]
  );

  const liveDistanceMeters = useMemo(
    () =>
      calculateHaversineDistanceMeters(
        lat,
        lng,
        targetLat,
        targetLng
      ),
    [lat, lng, targetLat, targetLng]
  );

  const isWithinRadius = liveDistanceMeters <= targetRadius;

  const handleAcquireBrowserGps = () => {
    setFeedback(null);
    if (!("geolocation" in navigator)) {
      setFeedback({
        type: "error",
        text: "Geolocation API is not supported by this browser.",
      });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setGpsSource("browser_gps");
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setFeedback({
          type: "error",
          text: `Browser GPS error: ${err.message}. You can use the GPS simulation presets below to test geofence validation.`,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSimulateInside = () => {
    setLat(Number((targetLat + 0.00009).toFixed(6)));
    setLng(Number((targetLng + 0.00007).toFixed(6)));
    setGpsSource("wellness_preset");
    setFeedback(null);
  };

  const handleSimulateOutside = () => {
    setLat(Number((targetLat + 0.0038).toFixed(6)));
    setLng(Number((targetLng + 0.0025).toFixed(6)));
    setGpsSource("outside_preset");
    setFeedback(null);
  };

  const handlePunch = async (action: "time_in" | "time_out") => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          action,
          latitude: lat,
          longitude: lng,
          workDate,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          text: data.error || "Attendance check failed.",
        });
      } else {
        setFeedback({
          type: "success",
          text: data.message,
        });
        setNotes("");
        await onRefresh();
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: (err as Error).message || "Network error during attendance call.",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalSharesEarned = myLogs.reduce(
    (acc, l) => acc + (l.daily_share_credited ? Number(l.daily_share_amount) : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Geofence & Check-In Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: GPS Geolocation Validator Card */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                <MapPin className="h-3.5 w-3.5" />
                GPS Coordinate Geolocation Check-In
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                {targetName}
              </h2>
              <p className="text-xs text-slate-500">
                Target Geofence Center:{" "}
                <span className="font-mono text-slate-700">
                  {targetLat.toFixed(5)},{" "}
                  {targetLng.toFixed(5)}
                </span>{" "}
                • Allowed Radius:{" "}
                <span className="font-semibold text-slate-700">
                  {targetRadius}m
                </span>
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold border ${
                isWithinRadius
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}
            >
              {isWithinRadius ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <div>
                <div>{liveDistanceMeters}m from Center</div>
                <div className="text-[10px] font-normal opacity-85">
                  {isWithinRadius
                    ? `Within ${targetRadius}m radius`
                    : `Outside ${targetRadius}m radius`}
                </div>
              </div>
            </div>
          </div>

          {/* GPS Coordinate Controls & Test Presets */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAcquireBrowserGps}
                disabled={locating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Navigation className="h-3.5 w-3.5" />
                {locating ? "Reading Device GPS..." : "Use Device / Browser GPS"}
              </button>

              <button
                type="button"
                onClick={handleSimulateInside}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  gpsSource === "wellness_preset"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                Simulate On-Site (~13m)
              </button>

              <button
                type="button"
                onClick={handleSimulateOutside}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  gpsSource === "outside_preset"
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Simulate Off-Site (~500m)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Device Latitude
                </label>
                <input
                  type="number"
                  step="0.00001"
                  value={lat}
                  onChange={(e) => {
                    setLat(parseFloat(e.target.value) || 0);
                    setGpsSource("custom");
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Device Longitude
                </label>
                <input
                  type="number"
                  step="0.00001"
                  value={lng}
                  onChange={(e) => {
                    setLng(parseFloat(e.target.value) || 0);
                    setGpsSource("custom");
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Shift Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Morning therapy & recovery shift"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`rounded-xl p-3.5 text-xs font-medium flex items-start gap-2.5 border ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={loading || Boolean(selectedDateLog)}
              onClick={() => handlePunch("time_in")}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <LogIn className="h-4 w-4" />
              {selectedDateLog ? "Already Timed In" : "Time-In (Verify GPS)"}
            </button>

            <button
              type="button"
              disabled={
                loading ||
                !selectedDateLog ||
                Boolean(selectedDateLog?.time_out)
              }
              onClick={() => handlePunch("time_out")}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <LogOut className="h-4 w-4" />
              {selectedDateLog?.time_out
                ? "Shift Completed"
                : "Time-Out (Verify GPS)"}
            </button>
          </div>
        </div>

        {/* Right: Daily Share & Shift Status Summary */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Daily Share & Shift Policy
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  employee.daily_share_eligible
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {employee.daily_share_eligible
                  ? `${formatPHP(employee.daily_share_rate)} / Physical Day`
                  : "Fixed Salary Role (No Daily Share)"}
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5">
              <div className="text-xs text-slate-500">
                Selected Date Status ({workDate})
              </div>
              {selectedDateLog ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Time-In:</span>
                    <span className="font-semibold text-slate-900">
                      {new Date(selectedDateLog.time_in).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ({selectedDateLog.time_in_distance_meters}m from center)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Time-Out:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedDateLog.time_out
                        ? `${new Date(selectedDateLog.time_out).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" }
                          )} (${selectedDateLog.time_out_distance_meters}m)`
                        : "Currently on shift"}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-600">Daily Share Credited:</span>
                    <span className="font-bold text-emerald-700">
                      {formatPHP(selectedDateLog.daily_share_amount)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600 flex items-center gap-2 py-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>
                    No check-in recorded yet for <strong>{workDate}</strong>.
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <div className="text-xs text-slate-500">Total Days Logged</div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {myLogs.length} days
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <div className="text-xs text-emerald-800 flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5" />
                  <span>Accumulated Shares</span>
                </div>
                <div className="text-xl font-bold text-emerald-800 mt-0.5">
                  {formatPHP(totalSharesEarned)}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
            <strong>Business Rule:</strong> Daily shares are only credited for
            actual days physically present at the wellness center. Paid leaves
            keep your monthly basic salary intact ({formatPHP(employee.basic_salary)})
            but forfeit the daily share for that day.
          </p>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Personal Attendance & Daily Share History
            </h3>
            <p className="text-xs text-slate-500">
              Showing {myLogs.length} verified check-in record(s) for{" "}
              {employee.full_name}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Time-In</th>
                <th className="py-3 px-4">Time-Out</th>
                <th className="py-3 px-4">GPS Distance</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Daily Share Credited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-400 italic"
                  >
                    No attendance logs recorded yet.
                  </td>
                </tr>
              ) : (
                myLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {log.work_date}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {new Date(log.time_in).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {log.time_out
                        ? new Date(log.time_out).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "On Shift"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {log.time_in_distance_meters}m{" "}
                      <span className="text-[10px] text-emerald-700 font-sans font-semibold">
                        (Verified)
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          log.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">
                      {formatPHP(log.daily_share_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
