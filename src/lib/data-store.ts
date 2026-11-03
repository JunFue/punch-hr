import fs from "fs";
import path from "path";
import {
  AttendanceLog,
  Branch,
  CompanySettings,
  DeductionType,
  EmployeeDeduction,
  LeaveRequest,
  PayrollRecord,
  UserProfile,
} from "@/types/hr";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listBranches } from "@/lib/branches";

export interface DemoDatabaseState {
  profiles: UserProfile[];
  branches: Branch[];
  companySettings: CompanySettings;
  deductionTypes: DeductionType[];
  employeeDeductions: EmployeeDeduction[];
  attendanceLogs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  payrollRecords: PayrollRecord[];
}

const DEMO_STORE_PATH = path.join(process.cwd(), ".demo-store.json");

export function getCleanEmptyState(): DemoDatabaseState {
  const nowIso = new Date().toISOString();

  const companySettings: CompanySettings = {
    id: "settings-primary",
    wellness_center_name: "Punch Wellness & Recovery Center",
    wellness_center_address: "",
    center_latitude: 14.5547,
    center_longitude: 121.0244,
    geofence_radius_meters: 100,
    enforce_geofence: true,
    working_days_per_month: 26,
    annual_leave_days: 12,
    max_paid_leave_per_quarter: 3,
    updated_at: nowIso,
  };

  const deductionTypes: DeductionType[] = [
    {
      id: "ded-sss",
      code: "sss",
      name: "SSS Contribution",
      description: "Social Security System monthly contribution.",
      default_amount: 900,
      is_mandatory: false,
      is_active: true,
    },
    {
      id: "ded-philhealth",
      code: "philhealth",
      name: "PhilHealth Premium",
      description: "Philippine Health Insurance Corp. monthly healthcare contribution.",
      default_amount: 500,
      is_mandatory: false,
      is_active: true,
    },
    {
      id: "ded-insurance",
      code: "insurance",
      name: "Wellness Group Insurance",
      description: "Supplemental health, accident & practitioner liability coverage.",
      default_amount: 450,
      is_mandatory: false,
      is_active: true,
    },
  ];

  return {
    profiles: [],
    branches: [],
    companySettings,
    deductionTypes,
    employeeDeductions: [],
    attendanceLogs: [],
    leaveRequests: [],
    payrollRecords: [],
  };
}

const globalForDemo = globalThis as unknown as {
  __punchHrDemoStore?: DemoDatabaseState;
  __supabaseSchemaReady?: boolean;
};

export function getDemoStore(): DemoDatabaseState {
  if (globalForDemo.__punchHrDemoStore) {
    return globalForDemo.__punchHrDemoStore;
  }

  try {
    if (fs.existsSync(DEMO_STORE_PATH)) {
      const raw = fs.readFileSync(DEMO_STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as DemoDatabaseState;
      // Filter out any leftover legacy dummy profiles if any
      parsed.profiles = (parsed.profiles || []).filter(
        (p) => !p.email.endsWith("@punchwellness.ph")
      );
      globalForDemo.__punchHrDemoStore = parsed;
      return parsed;
    }
  } catch {
    // Ignore file read errors
  }

  const clean = getCleanEmptyState();
  globalForDemo.__punchHrDemoStore = clean;
  saveDemoStore(clean);
  return clean;
}

export function saveDemoStore(state: DemoDatabaseState): void {
  globalForDemo.__punchHrDemoStore = state;
  try {
    fs.writeFileSync(DEMO_STORE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Ignore write errors in read-only environments
  }
}

export function resetDemoStore(): DemoDatabaseState {
  const clean = getCleanEmptyState();
  saveDemoStore(clean);
  return clean;
}

export async function isSupabaseSchemaReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (globalForDemo.__supabaseSchemaReady === true) return true;

  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return false;
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      return false;
    }
    globalForDemo.__supabaseSchemaReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function fetchAllSystemData(): Promise<{
  mode: "supabase" | "demo";
  data: DemoDatabaseState;
}> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient()!;
    const [
      { data: profiles },
      { data: settingsList },
      { data: deductionTypes },
      { data: employeeDeductions },
      { data: attendanceLogs },
      { data: leaveRequests },
      { data: payrollRecords },
      branches,
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("employee_code"),
      supabase.from("company_settings").select("*").limit(1),
      supabase.from("deduction_types").select("*").order("code"),
      supabase.from("employee_deductions").select("*"),
      supabase
        .from("attendance_logs")
        .select("*")
        .order("work_date", { ascending: false }),
      supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("payroll_records")
        .select("*")
        .order("pay_period_year", { ascending: false })
        .order("pay_period_month", { ascending: false }),
      listBranches(),
    ]);

    const fallback = getCleanEmptyState();
    return {
      mode: "supabase",
      data: {
        profiles: ((profiles as UserProfile[]) || []).filter(
          (p) => !p.email.endsWith("@punchwellness.ph")
        ),
        branches: branches || [],
        companySettings:
          (settingsList?.[0] as CompanySettings) ?? fallback.companySettings,
        deductionTypes:
          (deductionTypes as DeductionType[]) ?? fallback.deductionTypes,
        employeeDeductions: (employeeDeductions as EmployeeDeduction[]) ?? [],
        attendanceLogs: (attendanceLogs as AttendanceLog[]) ?? [],
        leaveRequests: (leaveRequests as LeaveRequest[]) ?? [],
        payrollRecords: (payrollRecords as PayrollRecord[]) ?? [],
      },
    };
  }

  const demoStore = getDemoStore();
  const branches = await listBranches();
  demoStore.branches = branches;
  return {
    mode: "demo",
    data: demoStore,
  };
}
