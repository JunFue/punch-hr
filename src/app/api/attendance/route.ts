import { NextRequest, NextResponse } from "next/server";
import {
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import { validateWellnessCenterGeofence } from "@/lib/geo";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AttendanceLog, CompanySettings, UserProfile } from "@/types/hr";
import { listBranches } from "@/lib/branches";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      employeeId,
      action, // 'time_in' | 'time_out'
      latitude,
      longitude,
      workDate,
      notes,
    } = body as {
      employeeId: string;
      action: "time_in" | "time_out";
      latitude: number;
      longitude: number;
      workDate?: string;
      notes?: string;
    };

    if (!employeeId || !action) {
      return NextResponse.json(
        { error: "employeeId and action ('time_in' | 'time_out') are required." },
        { status: 400 }
      );
    }

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        {
          error:
            "GPS coordinates (latitude and longitude) are required for attendance check-in/out.",
        },
        { status: 400 }
      );
    }

    const todayStr =
      workDate || new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;

      const [{ data: settingsData }, { data: empData }, branches] = await Promise.all([
        supabase.from("company_settings").select("*").limit(1).single(),
        supabase.from("profiles").select("*").eq("id", employeeId).single(),
        listBranches(),
      ]);

      if (!empData) {
        return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      }

      const defaultSettings = settingsData as CompanySettings;
      const employee = empData as UserProfile;

      // Find the employee's assigned branch or fallback to default settings
      const assignedBranch = employee.branch_id
        ? branches.find((b) => b.id === employee.branch_id)
        : null;

      const branchTarget = {
        wellness_center_name: assignedBranch ? assignedBranch.name : defaultSettings?.wellness_center_name || "Branch Center",
        wellness_center_address: assignedBranch ? assignedBranch.address : defaultSettings?.wellness_center_address || "",
        center_latitude: assignedBranch ? assignedBranch.center_latitude : defaultSettings?.center_latitude || 14.5547,
        center_longitude: assignedBranch ? assignedBranch.center_longitude : defaultSettings?.center_longitude || 121.0244,
        geofence_radius_meters: assignedBranch ? assignedBranch.geofence_radius_meters : defaultSettings?.geofence_radius_meters || 100,
        enforce_geofence: assignedBranch ? assignedBranch.enforce_geofence : defaultSettings?.enforce_geofence ?? true,
      };

      // Server-side GPS Geolocation validation against the branch geofence coordinates
      const geofence = validateWellnessCenterGeofence(latitude, longitude, branchTarget);
      if (!geofence.allowed) {
        return NextResponse.json(
          {
            error: geofence.message,
            geofence,
          },
          { status: 403 }
        );
      }

      if (action === "time_in") {
        const { data: existing } = await supabase
          .from("attendance_logs")
          .select("*")
          .eq("employee_id", employeeId)
          .eq("work_date", todayStr)
          .maybeSingle();

        if (existing) {
          return NextResponse.json(
            { error: "You have already timed in for this date.", log: existing },
            { status: 409 }
          );
        }

        const dailyShareAmount = employee.daily_share_eligible
          ? Number(employee.daily_share_rate)
          : 0;

        const { data: created, error } = await supabase
          .from("attendance_logs")
          .insert({
            employee_id: employeeId,
            work_date: todayStr,
            time_in: nowIso,
            time_in_lat: latitude,
            time_in_lng: longitude,
            time_in_distance_meters: geofence.distanceMeters,
            geofence_verified: true,
            daily_share_credited: true,
            daily_share_amount: dailyShareAmount,
            status: "present",
            notes: notes || "Verified via GPS Geofence",
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          log: created,
          geofence,
          message: `Time-in recorded! ${
            employee.daily_share_eligible
              ? `Daily share of ₱${dailyShareAmount.toLocaleString()} credited.`
              : ""
          }`,
        });
      } else {
        const { data: existing } = await supabase
          .from("attendance_logs")
          .select("*")
          .eq("employee_id", employeeId)
          .eq("work_date", todayStr)
          .maybeSingle();

        if (!existing) {
          return NextResponse.json(
            { error: "No active time-in record found for today to time out from." },
            { status: 404 }
          );
        }

        const { data: updated, error } = await supabase
          .from("attendance_logs")
          .update({
            time_out: nowIso,
            time_out_lat: latitude,
            time_out_lng: longitude,
            time_out_distance_meters: geofence.distanceMeters,
            status: "completed",
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          log: updated,
          geofence,
          message: "Time-out recorded and shift completed!",
        });
      }
    }

    // Demo Mode Execution
    const store = getDemoStore();
    const employee = store.profiles.find((p) => p.id === employeeId);
    if (!employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    const geofence = validateWellnessCenterGeofence(
      latitude,
      longitude,
      store.companySettings
    );

    if (!geofence.allowed) {
      return NextResponse.json(
        {
          error: geofence.message,
          geofence,
        },
        { status: 403 }
      );
    }

    const existingIdx = store.attendanceLogs.findIndex(
      (l) => l.employee_id === employeeId && l.work_date === todayStr
    );

    if (action === "time_in") {
      if (existingIdx !== -1) {
        return NextResponse.json(
          {
            error: `You have already timed in for ${todayStr}.`,
            log: store.attendanceLogs[existingIdx],
          },
          { status: 409 }
        );
      }

      const dailyShareAmount = employee.daily_share_eligible
        ? employee.daily_share_rate
        : 0;

      const newLog: AttendanceLog = {
        id: `att-${Date.now()}`,
        employee_id: employeeId,
        work_date: todayStr,
        time_in: nowIso,
        time_out: null,
        time_in_lat: latitude,
        time_in_lng: longitude,
        time_in_distance_meters: geofence.distanceMeters,
        time_out_lat: null,
        time_out_lng: null,
        time_out_distance_meters: null,
        geofence_verified: true,
        daily_share_credited: true,
        daily_share_amount: dailyShareAmount,
        status: "present",
        notes: notes || "Verified via Wellness Center GPS Geofence",
        created_at: nowIso,
      };

      store.attendanceLogs.unshift(newLog);
      saveDemoStore(store);

      return NextResponse.json({
        log: newLog,
        geofence,
        message: `Time-in recorded (${geofence.distanceMeters}m from center)! ${
          employee.daily_share_eligible
            ? `Daily share of ₱${dailyShareAmount.toLocaleString()} credited.`
            : ""
        }`,
      });
    } else {
      if (existingIdx === -1) {
        return NextResponse.json(
          { error: `No time-in log found for ${todayStr}. Please time in first.` },
          { status: 404 }
        );
      }

      const updatedLog: AttendanceLog = {
        ...store.attendanceLogs[existingIdx],
        time_out: nowIso,
        time_out_lat: latitude,
        time_out_lng: longitude,
        time_out_distance_meters: geofence.distanceMeters,
        status: "completed",
      };

      store.attendanceLogs[existingIdx] = updatedLog;
      saveDemoStore(store);

      return NextResponse.json({
        log: updatedLog,
        geofence,
        message: `Time-out recorded (${geofence.distanceMeters}m from center). Shift completed!`,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Attendance operation failed" },
      { status: 500 }
    );
  }
}
