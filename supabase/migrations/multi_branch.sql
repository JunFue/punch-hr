-- =============================================================================
-- PUNCH-HR: Multi-Branch & Multi-Tenant Supabase PostgreSQL Migration
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Branches Table
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  center_latitude DOUBLE PRECISION NOT NULL DEFAULT 14.5547,
  center_longitude DOUBLE PRECISION NOT NULL DEFAULT 121.0244,
  geofence_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  enforce_geofence BOOLEAN NOT NULL DEFAULT TRUE,
  working_days_per_month INTEGER NOT NULL DEFAULT 26,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add branch_id to profiles, attendance_logs, and payroll_records if not present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance_logs' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE public.attendance_logs ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Create Enrollment Codes Table (with branch_id)
CREATE TABLE IF NOT EXISTS public.enrollment_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
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

-- 4. Enable RLS on Branches & Enrollment Codes
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read branches" ON public.branches;
  CREATE POLICY "Authenticated users can read branches"
    ON public.branches FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
  CREATE POLICY "Admins can manage branches"
    ON public.branches FOR ALL
    USING (public.is_admin());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read enrollment codes" ON public.enrollment_codes;
  CREATE POLICY "Authenticated users can read enrollment codes"
    ON public.enrollment_codes FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage enrollment codes" ON public.enrollment_codes;
  CREATE POLICY "Admins can manage enrollment codes"
    ON public.enrollment_codes FOR ALL
    USING (public.is_admin());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
