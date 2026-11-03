"use client";

import React, { useState } from "react";
import { Building2, MapPin, Navigation, Plus, Save, Trash2 } from "lucide-react";
import { Branch } from "@/types/hr";

interface BranchManagementPanelProps {
  branches: Branch[];
  onRefresh: () => Promise<void>;
}

export default function BranchManagementPanel({
  branches,
  onRefresh,
}: BranchManagementPanelProps) {
  const [showAdd, setShowAdd] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [name, setName] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [lat, setLat] = useState<number>(14.5547);
  const [lng, setLng] = useState<number>(121.0244);
  const [radius, setRadius] = useState<number>(100);
  const [workingDays, setWorkingDays] = useState<number>(26);
  const [enforce, setEnforce] = useState<boolean>(true);

  const resetForm = () => {
    setName("");
    setAddress("");
    setLat(14.5547);
    setLng(121.0244);
    setRadius(100);
    setWorkingDays(26);
    setEnforce(true);
    setEditingId(null);
    setShowAdd(false);
  };

  const handleUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setMsg({ type: "error", text: "Geolocation is not supported by your browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setMsg({ type: "success", text: "Acquired your GPS coordinates for this branch." });
      },
      (err) => {
        setMsg({ type: "error", text: `Could not acquire GPS: ${err.message}` });
      }
    );
  };

  const handleStartEdit = (branch: Branch) => {
    setEditingId(branch.id);
    setName(branch.name);
    setAddress(branch.address);
    setLat(branch.center_latitude);
    setLng(branch.center_longitude);
    setRadius(branch.geofence_radius_meters);
    setWorkingDays(branch.working_days_per_month);
    setEnforce(branch.enforce_geofence);
    setShowAdd(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (editingId) {
        const res = await fetch("/api/branches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            name,
            address,
            center_latitude: lat,
            center_longitude: lng,
            geofence_radius_meters: radius,
            working_days_per_month: workingDays,
            enforce_geofence: enforce,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMsg({ type: "success", text: `Branch "${name}" updated successfully.` });
      } else {
        const res = await fetch("/api/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            address,
            center_latitude: lat,
            center_longitude: lng,
            geofence_radius_meters: radius,
            working_days_per_month: workingDays,
            enforce_geofence: enforce,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMsg({ type: "success", text: `Branch "${name}" created successfully.` });
      }

      resetForm();
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (branchId: string, branchName: string) => {
    if (!confirm(`Are you sure you want to delete branch "${branchName}"?`)) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/branches?id=${encodeURIComponent(branchId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type: "success", text: `Branch "${branchName}" deleted.` });
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border ${
            msg.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Header Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">
              Company Branches &amp; Geofence Management
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure physical branches. Employees are assigned to a branch, and their daily GPS check-ins are validated against their branch geofence.
          </p>
        </div>

        <button
          onClick={() => {
            if (showAdd) {
              resetForm();
            } else {
              setShowAdd(true);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          {showAdd ? "Cancel" : "Add New Branch"}
        </button>
      </div>

      {/* Add / Edit Branch Form */}
      {showAdd && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
            <span className="text-sm font-bold text-emerald-950">
              {editingId ? "Edit Branch" : "Register New Branch"}
            </span>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
            >
              <Navigation className="h-3.5 w-3.5" />
              Use My Current GPS
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Branch Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g., Makati Central Branch"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Physical Address
              </label>
              <input
                type="text"
                placeholder="e.g., Ayala Avenue, Makati City"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                GPS Latitude
              </label>
              <input
                required
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                GPS Longitude
              </label>
              <input
                required
                type="number"
                step="0.000001"
                value={lng}
                onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Geofence Radius (m)
              </label>
              <input
                required
                type="number"
                min={10}
                max={5000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) || 100)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Working Days Divisor
              </label>
              <input
                required
                type="number"
                min={15}
                max={31}
                value={workingDays}
                onChange={(e) => setWorkingDays(Number(e.target.value) || 26)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enforce}
                onChange={(e) => setEnforce(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              Enforce strict GPS geofence check-in for this branch
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                <Save className="h-3.5 w-3.5" />
                {editingId ? "Save Changes" : "Save Branch"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Branches List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400 italic">
            No branches registered yet. Click &ldquo;Add New Branch&rdquo; above to set up your first business location!
          </div>
        ) : (
          branches.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{b.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{b.address || "No address provided"}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                    <MapPin className="h-3 w-3 text-emerald-600" />
                    {b.geofence_radius_meters}m
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-[11px] text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Center GPS:</span>
                    <span className="font-mono text-slate-800">
                      {b.center_latitude.toFixed(4)}, {b.center_longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Geofence Enforced:</span>
                    <span className="font-semibold text-slate-800">
                      {b.enforce_geofence ? "Yes (Strict)" : "No (Advisory)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Monthly Divisor:</span>
                    <span className="font-semibold text-slate-800">{b.working_days_per_month} days</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => handleStartEdit(b)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id, b.name)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
