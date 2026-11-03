-- =============================================================================
-- PUNCH-HR: Supabase PostgreSQL Schema & Row Level Security (RLS) Policies
-- =============================================================================
-- Run this script in the Supabase SQL Editor to provision all tables, enums,
-- triggers, helper functions, and Row Level Security policies.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'employee');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'completed', 'half_day');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('regular', 'sick', 'emergency', 'special');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payroll_status AS ENUM ('draft', 'finalized', 'paid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. PROFILES (USERS) TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  employee_code TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  position TEXT NOT NULL DEFAULT 'Wellness Specialist',
  department TEXT NOT NULL DEFAULT 'Operations & Therapy',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 18000.00,
  daily_share_rate NUMERIC(12, 2) NOT NULL DEFAULT 350.00,
  daily_share_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  default_performance_perk NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  annual_leave_quota INTEGER NOT NULL DEFAULT 12,
  quarterly_leave_limit INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. COMPANY & GEOFENCE SETTINGS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wellness_center_name TEXT NOT NULL DEFAULT 'Punch Wellness & Recovery Center',
  wellness_center_address TEXT NOT NULL DEFAULT 'Ayala Avenue, Makati City, Metro Manila',
  center_latitude DOUBLE PRECISION NOT NULL DEFAULT 14.5547,
  center_longitude DOUBLE PRECISION NOT NULL DEFAULT 121.0244,
  geofence_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  enforce_geofence BOOLEAN NOT NULL DEFAULT TRUE,
  working_days_per_month INTEGER NOT NULL DEFAULT 26,
  annual_leave_days INTEGER NOT NULL DEFAULT 12,
  max_paid_leave_per_quarter INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. DEDUCTION TYPES & EMPLOYEE VOLUNTARY/MANDATORY DEDUCTIONS
-- -----------------------------------------------------------------------------
-- Designed with `is_mandatory` on `deduction_types` and `opt_in` on `employee_deductions`.
-- Currently voluntary (`is_mandatory = FALSE`), allowing per-employee opt-in toggles,
-- and can be switched to mandatory globally at any time by setting `is_mandatory = TRUE`.
CREATE TABLE IF NOT EXISTS public.deduction_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL, -- 'sss', 'philhealth', 'insurance'
  name TEXT NOT NULL,
  description TEXT,
  default_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deduction_type_id UUID NOT NULL REFERENCES public.deduction_types(id) ON DELETE CASCADE,
  opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  custom_amount NUMERIC(12, 2), -- NULL means use deduction_types.default_amount
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, deduction_type_id)
);

-- -----------------------------------------------------------------------------
-- 5. ATTENDANCE LOGS TABLE (WITH GPS COORDINATE VALIDATION)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_out TIMESTAMPTZ,
  time_in_lat DOUBLE PRECISION NOT NULL,
  time_in_lng DOUBLE PRECISION NOT NULL,
  time_in_distance_meters DOUBLE PRECISION NOT NULL,
  time_out_lat DOUBLE PRECISION,
  time_out_lng DOUBLE PRECISION,
  time_out_distance_meters DOUBLE PRECISION,
  geofence_verified BOOLEAN NOT NULL DEFAULT TRUE,
  daily_share_credited BOOLEAN NOT NULL DEFAULT TRUE,
  daily_share_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status attendance_status NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);

-- -----------------------------------------------------------------------------
-- 6. LEAVE REQUESTS & SPECIAL LEAVES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type leave_type NOT NULL DEFAULT 'regular',
  is_special_leave BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL CHECK (days_count > 0),
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  granted_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. PAYROLL RECORDS (MONTH-END PAYSLIPS) TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_period_month INTEGER NOT NULL CHECK (pay_period_month BETWEEN 1 AND 12),
  pay_period_year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  working_days_divisor INTEGER NOT NULL DEFAULT 26,
  days_physically_present INTEGER NOT NULL DEFAULT 0,
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  daily_share_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_daily_shares NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  performance_perk NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  regular_leaves_this_month INTEGER NOT NULL DEFAULT 0,
  regular_leaves_quarter_to_date INTEGER NOT NULL DEFAULT 0,
  paid_leaves_used_this_month INTEGER NOT NULL DEFAULT 0,
  excess_leave_days INTEGER NOT NULL DEFAULT 0,
  excess_leave_deduction_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  excess_leave_deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  special_leaves_count INTEGER NOT NULL DEFAULT 0,
  special_leave_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  sss_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  philhealth_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  insurance_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  gross_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status payroll_status NOT NULL DEFAULT 'finalized',
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, pay_period_year, pay_period_month)
);

-- -----------------------------------------------------------------------------
-- 7B. EMPLOYEE ENROLLMENT CODES TABLE (1-HOUR EXPIRATION)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollment_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  created_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT 'HR Admin',
  business_name TEXT NOT NULL DEFAULT 'Punch Wellness & Recovery Center',
  default_department TEXT NOT NULL DEFAULT 'Operations & Therapy',
  default_position TEXT NOT NULL DEFAULT 'Wellness Specialist',
  default_basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 18000.00,
  default_daily_share_rate NUMERIC(12, 2) NOT NULL DEFAULT 350.00,
  daily_share_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  used_count INTEGER NOT NULL DEFAULT 0,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE
);

-- -----------------------------------------------------------------------------
-- 8. INDEXES FOR PERFORMANCE
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON public.attendance_logs(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_leaves_employee_year_quarter ON public.leave_requests(employee_id, year, quarter);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON public.payroll_records(pay_period_year, pay_period_month);

-- -----------------------------------------------------------------------------
-- 9. HELPER FUNCTION FOR RLS ROLE CHECK
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE
  );
$$;

-- -----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_codes ENABLE ROW LEVEL SECURITY;

-- ENROLLMENT CODES: Authenticated users can read to validate code on signup; Admins manage all
CREATE POLICY "Authenticated users can read enrollment codes"
  ON public.enrollment_codes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage enrollment codes"
  ON public.enrollment_codes FOR ALL
  USING (public.is_admin());

-- PROFILES: Employees can read their own profile; Admins have full CRUD access
CREATE POLICY "Employees can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- COMPANY SETTINGS: Authenticated users can read; Admins can update
CREATE POLICY "Authenticated users can read company settings"
  ON public.company_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage company settings"
  ON public.company_settings FOR ALL
  USING (public.is_admin());

-- DEDUCTION TYPES: Authenticated users can read; Admins can manage
CREATE POLICY "Authenticated users can view deduction types"
  ON public.deduction_types FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage deduction types"
  ON public.deduction_types FOR ALL
  USING (public.is_admin());

-- EMPLOYEE DEDUCTIONS: Employees can view & toggle own voluntary deductions; Admins have full access
CREATE POLICY "Employees view own deductions or Admin views all"
  ON public.employee_deductions FOR SELECT
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Employees can update own voluntary deductions or Admin"
  ON public.employee_deductions FOR UPDATE
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Admins can insert/delete employee deductions"
  ON public.employee_deductions FOR ALL
  USING (public.is_admin());

-- ATTENDANCE LOGS: Employees can view & log own attendance; Admins have full access
CREATE POLICY "Employees view own attendance or Admin views all"
  ON public.attendance_logs FOR SELECT
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Employees can insert own attendance"
  ON public.attendance_logs FOR INSERT
  WITH CHECK (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Employees can update own time-out or Admin"
  ON public.attendance_logs FOR UPDATE
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Admins can delete attendance logs"
  ON public.attendance_logs FOR DELETE
  USING (public.is_admin());

-- LEAVE REQUESTS: Employees can view & file own regular leaves; Admins have full access (including special leaves)
CREATE POLICY "Employees view own leaves or Admin views all"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Employees can file own non-special leaves"
  ON public.leave_requests FOR INSERT
  WITH CHECK (
    (auth.uid() = employee_id AND is_special_leave = FALSE AND status = 'pending')
    OR public.is_admin()
  );

CREATE POLICY "Admins can update/approve/reject leaves"
  ON public.leave_requests FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete leaves"
  ON public.leave_requests FOR DELETE
  USING (public.is_admin());

-- PAYROLL RECORDS: Employees can only view their own payslips; Admins have full access
CREATE POLICY "Employees view own payslips or Admin views all"
  ON public.payroll_records FOR SELECT
  USING (auth.uid() = employee_id OR public.is_admin());

CREATE POLICY "Admins can manage all payroll records"
  ON public.payroll_records FOR ALL
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 11. SEED DEFAULT DEDUCTION TYPES & COMPANY SETTINGS
-- -----------------------------------------------------------------------------
INSERT INTO public.deduction_types (code, name, description, default_amount, is_mandatory, is_active)
VALUES
  ('sss', 'SSS Contribution', 'Social Security System monthly employee contribution (currently voluntary; toggle is_mandatory to enforce globally)', 900.00, FALSE, TRUE),
  ('philhealth', 'PhilHealth', 'Philippine Health Insurance Corporation monthly premium (currently voluntary; toggle is_mandatory to enforce globally)', 500.00, FALSE, TRUE),
  ('insurance', 'Wellness Group Insurance', 'Supplemental health & accident insurance coverage (voluntary opt-in)', 450.00, FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.company_settings (
  wellness_center_name,
  wellness_center_address,
  center_latitude,
  center_longitude,
  geofence_radius_meters,
  enforce_geofence,
  working_days_per_month,
  annual_leave_days,
  max_paid_leave_per_quarter
)
SELECT
  'Punch Wellness & Recovery Center',
  'Ayala Avenue, Makati City, Metro Manila',
  14.5547,
  121.0244,
  100.0,
  TRUE,
  26,
  12,
  3
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);
