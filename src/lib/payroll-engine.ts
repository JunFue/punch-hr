import {
  AttendanceLog,
  CompanySettings,
  DeductionType,
  EmployeeDeduction,
  LeaveQuotaSummary,
  LeaveRequest,
  PayrollRecord,
  SpecialLeaveDetail,
  UserProfile,
} from "@/types/hr";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getQuarterFromMonth(month: number): number {
  return Math.ceil(month / 3);
}

export function getQuarterMonths(quarter: number): [number, number, number] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Computes an employee's leave quota summary for a given year and quarter.
 */
export function calculateLeaveQuotaSummary(
  employee: UserProfile,
  leaves: LeaveRequest[],
  year: number,
  quarter: number,
  settings?: CompanySettings
): LeaveQuotaSummary {
  const annualLimit = employee.annual_leave_quota || settings?.annual_leave_days || 12;
  const quarterlyLimit =
    employee.quarterly_leave_limit || settings?.max_paid_leave_per_quarter || 3;

  const approvedYearLeaves = leaves.filter(
    (l) => l.employee_id === employee.id && l.year === year && l.status === "approved"
  );

  let annualRegularUsed = 0;
  let quarterRegularUsed = 0;
  let specialLeavesYearToDate = 0;
  let specialLeavesThisQuarter = 0;

  for (const lv of approvedYearLeaves) {
    const isSpecial = lv.is_special_leave || lv.leave_type === "special";
    if (isSpecial) {
      specialLeavesYearToDate += lv.days_count;
      if (lv.quarter === quarter) {
        specialLeavesThisQuarter += lv.days_count;
      }
    } else {
      annualRegularUsed += lv.days_count;
      if (lv.quarter === quarter) {
        quarterRegularUsed += lv.days_count;
      }
    }
  }

  const quarterRegularRemaining = Math.max(0, quarterlyLimit - quarterRegularUsed);
  const annualRegularRemaining = Math.max(0, annualLimit - annualRegularUsed);
  const quarterExcessDays = Math.max(0, quarterRegularUsed - quarterlyLimit);

  return {
    year,
    quarter,
    annualLimit,
    quarterlyLimit,
    annualRegularUsed,
    annualRegularRemaining,
    quarterRegularUsed,
    quarterRegularRemaining,
    quarterExcessDays,
    specialLeavesYearToDate,
    specialLeavesThisQuarter,
  };
}

/**
 * Calculates the complete monthly payroll and payslip breakdown for an employee.
 */
export function calculateEmployeeMonthlyPayroll(params: {
  employee: UserProfile;
  month: number; // 1..12
  year: number;
  attendanceLogs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  deductionTypes: DeductionType[];
  employeeDeductions: EmployeeDeduction[];
  settings: CompanySettings;
  performancePerkOverride?: number;
  otherDeductionsOverride?: number;
  generatedByAdminId?: string | null;
}): Omit<PayrollRecord, "id"> {
  const {
    employee,
    month,
    year,
    attendanceLogs,
    leaveRequests,
    deductionTypes,
    employeeDeductions,
    settings,
    performancePerkOverride,
    otherDeductionsOverride,
    generatedByAdminId = null,
  } = params;

  const quarter = getQuarterFromMonth(month);
  const quarterStartMonth = (quarter - 1) * 3 + 1;

  const workingDaysDivisor = settings.working_days_per_month || 26;
  const quarterlyLimit =
    employee.quarterly_leave_limit || settings.max_paid_leave_per_quarter || 3;
  const annualLimit = employee.annual_leave_quota || settings.annual_leave_days || 12;

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  // 1. Attendance & Daily Shares (only credited for actual days physically present)
  const monthlyAttendance = attendanceLogs.filter(
    (log) =>
      log.employee_id === employee.id &&
      log.work_date.startsWith(monthPrefix) &&
      log.daily_share_credited
  );

  const daysPhysicallyPresent = monthlyAttendance.length;
  const effectiveDailyShareRate = employee.daily_share_eligible
    ? round2(employee.daily_share_rate)
    : 0;
  const totalDailyShares = employee.daily_share_eligible
    ? round2(daysPhysicallyPresent * effectiveDailyShareRate)
    : 0;

  // 2. Leaves analysis for the year & quarter up to `month`
  const approvedLeavesInYear = leaveRequests.filter(
    (lv) =>
      lv.employee_id === employee.id &&
      lv.year === year &&
      lv.status === "approved"
  );

  let priorQuarterRegularLeaves = 0;
  let priorYearRegularLeaves = 0;
  let regularLeavesThisMonth = 0;
  let specialLeavesCount = 0;
  const specialLeaveDetails: SpecialLeaveDetail[] = [];

  for (const lv of approvedLeavesInYear) {
    // Parse month from YYYY-MM-DD safely without timezone drift
    const parts = lv.start_date.split("-");
    const lvMonth = parseInt(parts[1], 10);
    const isSpecial = lv.is_special_leave || lv.leave_type === "special";

    if (isSpecial) {
      if (lvMonth === month) {
        specialLeavesCount += lv.days_count;
        specialLeaveDetails.push({
          id: lv.id,
          start_date: lv.start_date,
          end_date: lv.end_date,
          days_count: lv.days_count,
          reason: lv.reason,
        });
      }
    } else {
      if (lvMonth < month) {
        priorYearRegularLeaves += lv.days_count;
        if (lvMonth >= quarterStartMonth && lv.quarter === quarter) {
          priorQuarterRegularLeaves += lv.days_count;
        }
      } else if (lvMonth === month) {
        regularLeavesThisMonth += lv.days_count;
      }
    }
  }

  // Remaining paid leave allowance entering this month (respecting both 3/quarter and 12/year limits)
  const remainingQuarterPaidQuota = Math.max(
    0,
    quarterlyLimit - priorQuarterRegularLeaves
  );
  const remainingAnnualPaidQuota = Math.max(
    0,
    annualLimit - priorYearRegularLeaves
  );
  const availablePaidQuotaThisMonth = Math.min(
    remainingQuarterPaidQuota,
    remainingAnnualPaidQuota
  );

  const paidLeavesUsedThisMonth = Math.min(
    regularLeavesThisMonth,
    availablePaidQuotaThisMonth
  );
  const excessLeaveDays = Math.max(
    0,
    regularLeavesThisMonth - paidLeavesUsedThisMonth
  );

  const basicSalary = round2(employee.basic_salary);
  const excessLeaveDeductionRate = round2(basicSalary / workingDaysDivisor);
  const excessLeaveDeductionAmount = round2(
    excessLeaveDays * excessLeaveDeductionRate
  );

  // 3. Voluntary / Mandatory Deductions (SSS, PhilHealth, Insurance)
  let sssDeduction = 0;
  let philhealthDeduction = 0;
  let insuranceDeduction = 0;

  for (const dt of deductionTypes) {
    if (!dt.is_active) continue;
    const empDed = employeeDeductions.find(
      (ed) => ed.employee_id === employee.id && ed.deduction_type_id === dt.id
    );
    const shouldApply = dt.is_mandatory || Boolean(empDed?.opt_in);
    if (shouldApply) {
      const amount = round2(
        empDed?.custom_amount !== null && empDed?.custom_amount !== undefined
          ? empDed.custom_amount
          : dt.default_amount
      );
      if (dt.code === "sss") sssDeduction = amount;
      else if (dt.code === "philhealth") philhealthDeduction = amount;
      else if (dt.code === "insurance") insuranceDeduction = amount;
    }
  }

  const performancePerk = round2(
    performancePerkOverride !== undefined
      ? performancePerkOverride
      : employee.default_performance_perk
  );
  const otherDeductions = round2(otherDeductionsOverride ?? 0);

  const grossEarnings = round2(
    basicSalary + totalDailyShares + performancePerk
  );
  const totalDeductions = round2(
    excessLeaveDeductionAmount +
      sssDeduction +
      philhealthDeduction +
      insuranceDeduction +
      otherDeductions
  );
  const netPay = round2(Math.max(0, grossEarnings - totalDeductions));

  return {
    employee_id: employee.id,
    pay_period_month: month,
    pay_period_year: year,
    quarter,
    working_days_divisor: workingDaysDivisor,
    days_physically_present: daysPhysicallyPresent,
    basic_salary: basicSalary,
    daily_share_rate: effectiveDailyShareRate,
    total_daily_shares: totalDailyShares,
    performance_perk: performancePerk,
    regular_leaves_this_month: regularLeavesThisMonth,
    regular_leaves_quarter_to_date:
      priorQuarterRegularLeaves + regularLeavesThisMonth,
    paid_leaves_used_this_month: paidLeavesUsedThisMonth,
    excess_leave_days: excessLeaveDays,
    excess_leave_deduction_rate: excessLeaveDeductionRate,
    excess_leave_deduction_amount: excessLeaveDeductionAmount,
    special_leaves_count: specialLeavesCount,
    special_leave_details: specialLeaveDetails,
    sss_deduction: sssDeduction,
    philhealth_deduction: philhealthDeduction,
    insurance_deduction: insuranceDeduction,
    other_deductions: otherDeductions,
    gross_earnings: grossEarnings,
    total_deductions: totalDeductions,
    net_pay: netPay,
    status: "finalized",
    generated_by: generatedByAdminId,
    generated_at: new Date().toISOString(),
  };
}
