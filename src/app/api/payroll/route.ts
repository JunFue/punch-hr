import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllSystemData,
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import { calculateEmployeeMonthlyPayroll, MONTH_NAMES } from "@/lib/payroll-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PayrollRecord } from "@/types/hr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      month,
      year,
      performancePerkOverrides = {},
      otherDeductionsOverrides = {},
      generatedByAdminId = null,
    } = body as {
      month: number;
      year: number;
      performancePerkOverrides?: Record<string, number>;
      otherDeductionsOverrides?: Record<string, number>;
      generatedByAdminId?: string | null;
    };

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Valid month (1-12) and year are required." },
        { status: 400 }
      );
    }

    const { data: systemData } = await fetchAllSystemData();
    const activeEmployees = systemData.profiles.filter((p) => p.is_active);

    const generatedRecords: PayrollRecord[] = [];

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;

      for (const emp of activeEmployees) {
        const payload = calculateEmployeeMonthlyPayroll({
          employee: emp,
          month,
          year,
          attendanceLogs: systemData.attendanceLogs,
          leaveRequests: systemData.leaveRequests,
          deductionTypes: systemData.deductionTypes,
          employeeDeductions: systemData.employeeDeductions,
          settings: systemData.companySettings,
          performancePerkOverride: performancePerkOverrides[emp.id],
          otherDeductionsOverride: otherDeductionsOverrides[emp.id],
          generatedByAdminId,
        });

        const { data: upserted, error } = await supabase
          .from("payroll_records")
          .upsert(payload, {
            onConflict: "employee_id,pay_period_year,pay_period_month",
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        generatedRecords.push(upserted as PayrollRecord);
      }

      return NextResponse.json({
        payrollRecords: generatedRecords,
        message: `Month-end payroll generated for ${MONTH_NAMES[month - 1]} ${year} (${generatedRecords.length} payslips finalized).`,
      });
    }

    const store = getDemoStore();

    for (const emp of activeEmployees) {
      const payload = calculateEmployeeMonthlyPayroll({
        employee: emp,
        month,
        year,
        attendanceLogs: store.attendanceLogs,
        leaveRequests: store.leaveRequests,
        deductionTypes: store.deductionTypes,
        employeeDeductions: store.employeeDeductions,
        settings: store.companySettings,
        performancePerkOverride: performancePerkOverrides[emp.id],
        otherDeductionsOverride: otherDeductionsOverrides[emp.id],
        generatedByAdminId: generatedByAdminId || "usr-admin-001",
      });

      const existingIdx = store.payrollRecords.findIndex(
        (r) =>
          r.employee_id === emp.id &&
          r.pay_period_month === month &&
          r.pay_period_year === year
      );

      if (existingIdx !== -1) {
        const updated: PayrollRecord = {
          ...payload,
          id: store.payrollRecords[existingIdx].id,
        };
        store.payrollRecords[existingIdx] = updated;
        generatedRecords.push(updated);
      } else {
        const created: PayrollRecord = {
          id: `pay-${year}-${month}-${emp.employee_code}-${Date.now()}`,
          ...payload,
        };
        store.payrollRecords.unshift(created);
        generatedRecords.push(created);
      }
    }

    saveDemoStore(store);

    return NextResponse.json({
      payrollRecords: generatedRecords,
      message: `Month-end payroll generated for ${MONTH_NAMES[month - 1]} ${year} (${generatedRecords.length} employee payslips finalized).`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Payroll generation failed" },
      { status: 500 }
    );
  }
}
