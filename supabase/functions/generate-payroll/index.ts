// =============================================================================
// Supabase Edge Function: generate-payroll
// Deploy with: supabase functions deploy generate-payroll
// Note: The Next.js app also includes this full payroll calculation engine in
// `/api/payroll` so it works seamlessly on Vercel or local dev without needing
// a separate Edge Function deployment.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { month, year, performancePerks = {} } = await req.json();
    if (!month || !year) {
      return new Response(JSON.stringify({ error: "month and year are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quarter = Math.ceil(month / 3);
    const quarterStartMonth = (quarter - 1) * 3 + 1;

    // 1. Load company settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .single();

    const workingDaysDivisor = settings?.working_days_per_month ?? 26;
    const quarterlyLimit = settings?.max_paid_leave_per_quarter ?? 3;

    // 2. Load active employees
    const { data: employees } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true);

    // 3. Load deduction types & employee deduction settings
    const { data: deductionTypes } = await supabase
      .from("deduction_types")
      .select("*")
      .eq("is_active", true);

    const { data: empDeductions } = await supabase
      .from("employee_deductions")
      .select("*");

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const results = [];

    for (const emp of employees ?? []) {
      // Days physically present in month
      const { data: attendance } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("employee_id", emp.id)
        .gte("work_date", startDate)
        .lte("work_date", endDate);

      const daysPresent = (attendance ?? []).length;
      const totalDailyShares = emp.daily_share_eligible
        ? daysPresent * Number(emp.daily_share_rate)
        : 0;

      // Leaves in quarter up to this month
      const { data: quarterLeaves } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("year", year)
        .eq("quarter", quarter)
        .eq("status", "approved");

      let regularPriorMonths = 0;
      let regularThisMonth = 0;
      let specialThisMonth = 0;
      const specialDetails: Array<{ start_date: string; end_date: string; days_count: number; reason: string }> = [];

      for (const lv of quarterLeaves ?? []) {
        const lvMonth = new Date(lv.start_date).getMonth() + 1;
        if (lv.is_special_leave || lv.leave_type === "special") {
          if (lvMonth === month) {
            specialThisMonth += lv.days_count;
            specialDetails.push({
              start_date: lv.start_date,
              end_date: lv.end_date,
              days_count: lv.days_count,
              reason: lv.reason,
            });
          }
        } else {
          if (lvMonth < month && lvMonth >= quarterStartMonth) {
            regularPriorMonths += lv.days_count;
          } else if (lvMonth === month) {
            regularThisMonth += lv.days_count;
          }
        }
      }

      const remainingPaidQuotaBeforeMonth = Math.max(0, quarterlyLimit - regularPriorMonths);
      const paidLeavesThisMonth = Math.min(regularThisMonth, remainingPaidQuotaBeforeMonth);
      const excessLeaveDays = Math.max(0, regularThisMonth - remainingPaidQuotaBeforeMonth);

      const dailyDeductionRate = Number((Number(emp.basic_salary) / workingDaysDivisor).toFixed(2));
      const excessLeaveDeductionAmount = Number((excessLeaveDays * dailyDeductionRate).toFixed(2));

      // Voluntary / Mandatory Deductions
      let sss = 0;
      let philhealth = 0;
      let insurance = 0;

      for (const dt of deductionTypes ?? []) {
        const empDed = (empDeductions ?? []).find(
          (d: { employee_id: string; deduction_type_id: string }) =>
            d.employee_id === emp.id && d.deduction_type_id === dt.id
        );
        const applies = dt.is_mandatory || empDed?.opt_in;
        if (applies) {
          const amt = Number(empDed?.custom_amount ?? dt.default_amount ?? 0);
          if (dt.code === "sss") sss = amt;
          if (dt.code === "philhealth") philhealth = amt;
          if (dt.code === "insurance") insurance = amt;
        }
      }

      const perk = Number(performancePerks[emp.id] ?? emp.default_performance_perk ?? 0);
      const basicSalary = Number(emp.basic_salary);
      const grossEarnings = Number((basicSalary + totalDailyShares + perk).toFixed(2));
      const totalDeductions = Number(
        (excessLeaveDeductionAmount + sss + philhealth + insurance).toFixed(2)
      );
      const netPay = Number(Math.max(0, grossEarnings - totalDeductions).toFixed(2));

      const record = {
        employee_id: emp.id,
        pay_period_month: month,
        pay_period_year: year,
        quarter,
        working_days_divisor: workingDaysDivisor,
        days_physically_present: daysPresent,
        basic_salary: basicSalary,
        daily_share_rate: emp.daily_share_eligible ? Number(emp.daily_share_rate) : 0,
        total_daily_shares: totalDailyShares,
        performance_perk: perk,
        regular_leaves_this_month: regularThisMonth,
        regular_leaves_quarter_to_date: regularPriorMonths + regularThisMonth,
        paid_leaves_used_this_month: paidLeavesThisMonth,
        excess_leave_days: excessLeaveDays,
        excess_leave_deduction_rate: dailyDeductionRate,
        excess_leave_deduction_amount: excessLeaveDeductionAmount,
        special_leaves_count: specialThisMonth,
        special_leave_details: specialDetails,
        sss_deduction: sss,
        philhealth_deduction: philhealth,
        insurance_deduction: insurance,
        other_deductions: 0,
        gross_earnings: grossEarnings,
        total_deductions: totalDeductions,
        net_pay: netPay,
        status: "finalized",
      };

      const { data: saved } = await supabase
        .from("payroll_records")
        .upsert(record, { onConflict: "employee_id,pay_period_year,pay_period_month" })
        .select()
        .single();

      results.push(saved ?? record);
    }

    return new Response(JSON.stringify({ payroll: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
