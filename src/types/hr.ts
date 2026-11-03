export type UserRole = "admin" | "employee";

export type AttendanceStatus = "present" | "completed" | "half_day";

export type LeaveType = "regular" | "sick" | "emergency" | "special";

export type LeaveStatus = "pending" | "approved" | "rejected";

export type PayrollStatus = "draft" | "finalized" | "paid";

export interface Branch {
  id: string;
  name: string; // e.g., "Makati Central Branch", "Iligan City Branch"
  address: string;
  center_latitude: number;
  center_longitude: number;
  geofence_radius_meters: number;
  enforce_geofence: boolean;
  working_days_per_month: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  employee_code: string;
  role: UserRole;
  branch_id?: string | null;
  position: string;
  department: string;
  basic_salary: number;
  daily_share_rate: number;
  daily_share_eligible: boolean;
  default_performance_perk: number;
  annual_leave_quota: number;
  quarterly_leave_limit: number;
  is_active: boolean;
  joined_date: string;
  created_at: string;
  updated_at: string;
}

export interface CompanySettings {
  id: string;
  wellness_center_name: string;
  wellness_center_address: string;
  center_latitude: number;
  center_longitude: number;
  geofence_radius_meters: number;
  enforce_geofence: boolean;
  working_days_per_month: number;
  annual_leave_days: number;
  max_paid_leave_per_quarter: number;
  updated_at: string;
}

export interface DeductionType {
  id: string;
  code: "sss" | "philhealth" | "insurance" | string;
  name: string;
  description: string;
  default_amount: number;
  is_mandatory: boolean;
  is_active: boolean;
}

export interface EmployeeDeduction {
  id: string;
  employee_id: string;
  deduction_type_id: string;
  opt_in: boolean;
  custom_amount: number | null;
  updated_at: string;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  time_in: string; // ISO timestamp
  time_out: string | null; // ISO timestamp
  time_in_lat: number;
  time_in_lng: number;
  time_in_distance_meters: number;
  time_out_lat: number | null;
  time_out_lng: number | null;
  time_out_distance_meters: number | null;
  geofence_verified: boolean;
  daily_share_credited: boolean;
  daily_share_amount: number;
  status: AttendanceStatus;
  notes: string | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  is_special_leave: boolean;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  days_count: number;
  quarter: number; // 1..4
  year: number;
  reason: string;
  status: LeaveStatus;
  granted_by_admin_id: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  admin_remarks: string | null;
  created_at: string;
}

export interface SpecialLeaveDetail {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  pay_period_month: number; // 1..12
  pay_period_year: number;
  quarter: number; // 1..4
  working_days_divisor: number;
  days_physically_present: number;
  basic_salary: number;
  daily_share_rate: number;
  total_daily_shares: number;
  performance_perk: number;
  regular_leaves_this_month: number;
  regular_leaves_quarter_to_date: number;
  paid_leaves_used_this_month: number;
  excess_leave_days: number;
  excess_leave_deduction_rate: number;
  excess_leave_deduction_amount: number;
  special_leaves_count: number;
  special_leave_details: SpecialLeaveDetail[];
  sss_deduction: number;
  philhealth_deduction: number;
  insurance_deduction: number;
  other_deductions: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  status: PayrollStatus;
  generated_by: string | null;
  generated_at: string;
}

export interface LeaveQuotaSummary {
  year: number;
  quarter: number;
  annualLimit: number;
  quarterlyLimit: number;
  annualRegularUsed: number;
  annualRegularRemaining: number;
  quarterRegularUsed: number;
  quarterRegularRemaining: number;
  quarterExcessDays: number;
  specialLeavesYearToDate: number;
  specialLeavesThisQuarter: number;
}

export interface GeofenceValidationResult {
  allowed: boolean;
  distanceMeters: number;
  maxRadiusMeters: number;
  centerLatitude: number;
  centerLongitude: number;
  userLatitude: number;
  userLongitude: number;
  message: string;
}

export interface EnrollmentCode {
  id: string;
  code: string;
  branch_id?: string | null;
  branch_name?: string | null;
  created_by_admin_id: string;
  created_by_name: string;
  business_name: string;
  default_department: string;
  default_position: string;
  default_basic_salary: number;
  default_daily_share_rate: number;
  daily_share_eligible: boolean;
  created_at: string; // ISO timestamp
  expires_at: string; // ISO timestamp (1 hour after created_at)
  used_count: number;
  is_revoked: boolean;
}

