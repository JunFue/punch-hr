import { NextRequest, NextResponse } from "next/server";
import {
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import { getQuarterFromMonth } from "@/lib/payroll-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { LeaveRequest, LeaveStatus, LeaveType } from "@/types/hr";

function computeDaysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      employeeId,
      leaveType = "regular",
      isSpecialLeave = false,
      startDate,
      endDate,
      daysCount,
      reason,
      grantedByAdminId = null,
    } = body as {
      employeeId: string;
      leaveType?: LeaveType;
      isSpecialLeave?: boolean;
      startDate: string;
      endDate: string;
      daysCount?: number;
      reason: string;
      grantedByAdminId?: string | null;
    };

    if (!employeeId || !startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: "employeeId, startDate, endDate, and reason are required." },
        { status: 400 }
      );
    }

    const parts = startDate.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const quarter = getQuarterFromMonth(month);
    const calculatedDays =
      daysCount && daysCount > 0
        ? daysCount
        : computeDaysBetweenInclusive(startDate, endDate);

    const specialFlag = Boolean(isSpecialLeave || leaveType === "special");
    const effectiveType: LeaveType = specialFlag ? "special" : leaveType;
    const initialStatus: LeaveStatus = specialFlag ? "approved" : "pending";
    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;
      const { data: created, error } = await supabase
        .from("leave_requests")
        .insert({
          employee_id: employeeId,
          leave_type: effectiveType,
          is_special_leave: specialFlag,
          start_date: startDate,
          end_date: endDate,
          days_count: calculatedDays,
          quarter,
          year,
          reason,
          status: initialStatus,
          granted_by_admin_id: specialFlag ? grantedByAdminId : null,
          reviewed_by_admin_id: specialFlag ? grantedByAdminId : null,
          reviewed_at: specialFlag ? nowIso : null,
          admin_remarks: specialFlag
            ? "Admin-granted Special Leave (bypasses quarterly limit; itemized on payslip)"
            : null,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        leave: created,
        message: specialFlag
          ? "Special Leave granted and approved! It will bypass quarterly limits and be uniquely itemized on the employee's payslip."
          : "Leave application submitted for Admin review.",
      });
    }

    const store = getDemoStore();
    const newLeave: LeaveRequest = {
      id: `lv-${Date.now()}`,
      employee_id: employeeId,
      leave_type: effectiveType,
      is_special_leave: specialFlag,
      start_date: startDate,
      end_date: endDate,
      days_count: calculatedDays,
      quarter,
      year,
      reason,
      status: initialStatus,
      granted_by_admin_id: specialFlag ? grantedByAdminId : null,
      reviewed_by_admin_id: specialFlag ? grantedByAdminId : null,
      reviewed_at: specialFlag ? nowIso : null,
      admin_remarks: specialFlag
        ? "Admin-granted Special Leave (bypasses 3-day quarterly limit; uniquely itemized on payslip)"
        : null,
      created_at: nowIso,
    };

    store.leaveRequests.unshift(newLeave);
    saveDemoStore(store);

    return NextResponse.json({
      leave: newLeave,
      message: specialFlag
        ? "Special Leave granted and approved! Bypasses the 3-day quarterly limit and is itemized on the payslip."
        : "Leave filing submitted for Admin approval.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to submit leave request" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      leaveId,
      status, // 'approved' | 'rejected'
      adminRemarks,
      reviewedByAdminId,
    } = body as {
      leaveId: string;
      status: "approved" | "rejected";
      adminRemarks?: string;
      reviewedByAdminId?: string;
    };

    if (!leaveId || !status) {
      return NextResponse.json(
        { error: "leaveId and status ('approved' | 'rejected') are required." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;
      const { data: updated, error } = await supabase
        .from("leave_requests")
        .update({
          status,
          admin_remarks: adminRemarks || null,
          reviewed_by_admin_id: reviewedByAdminId || null,
          reviewed_at: nowIso,
        })
        .eq("id", leaveId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        leave: updated,
        message: `Leave request ${status}.`,
      });
    }

    const store = getDemoStore();
    const idx = store.leaveRequests.findIndex((l) => l.id === leaveId);
    if (idx === -1) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
    }

    store.leaveRequests[idx] = {
      ...store.leaveRequests[idx],
      status,
      admin_remarks:
        adminRemarks !== undefined
          ? adminRemarks
          : store.leaveRequests[idx].admin_remarks,
      reviewed_by_admin_id: reviewedByAdminId || "usr-admin-001",
      reviewed_at: nowIso,
    };

    saveDemoStore(store);

    return NextResponse.json({
      leave: store.leaveRequests[idx],
      message: `Leave request ${status}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update leave request" },
      { status: 500 }
    );
  }
}
