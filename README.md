# Punch-HR — Wellness Center HR, GPS Attendance & Dynamic Payroll Platform

A customized HR and Payroll web application built for **Punch-HR** using **Next.js (App Router + TypeScript)**, **Tailwind CSS**, **Supabase (PostgreSQL + Auth + RLS + Edge Function)**, and **jsPDF** for downloadable/printable month-end payslips.

---

## Core Features & Business Logic

1. **Dual-Role Authentication (`admin` & `employee`)**
   - **Admin Portal:** Approve/reject leave requests, grant Special Leaves, adjust base salaries & daily share rates, manage voluntary/mandatory deductions (SSS, PhilHealth, Insurance), configure Wellness Center GPS geofence coordinates, trigger month-end payroll generation, and print/download all employee PDF payslips.
   - **Employee Portal:** Daily GPS coordinate check-in/out, personal attendance & daily share tracker, leave filing with live quarterly quota check, voluntary deduction toggles, and downloadable individual PDF payslips.

2. **Compensation & Daily Attendance Shares**
   - Monthly Basic Salary + End-of-Month Performance Perks + Daily Share Allowance (`daily_share_rate × days_physically_present` for eligible employees).
   - Daily shares are credited **only** for actual days physically present.

3. **Leave Policy & Excess Quarterly Leave Penalties**
   - **12 Paid Leave Days Annually**, with a strict maximum of **3 Paid Leave Days per Quarter**.
   - Valid paid leaves within the 3-day quarterly limit keep the monthly basic salary intact, while forfeiting the daily share for those leave days.
   - Any regular leave taken beyond the 3-day quarterly limit automatically triggers a deduction from the basic salary:
     $$\text{Excess Leave Deduction} = \text{Excess Days} \times \left(\frac{\text{Basic Salary}}{\text{Working Days Divisor}}\right)$$

4. **Admin-Granted Special Leaves**
   - Admins can grant **Special Leaves** that bypass the 3-day quarterly limit and keep the basic salary intact (`₱0` penalty).
   - The exact number of Special Leaves taken and their dates/authorization reasons are **uniquely itemized** on the generated payslip.

5. **Voluntary / Mandatory Deductions Architecture (SSS, PhilHealth, Insurance)**
   - Modeled via `deduction_types` (`is_mandatory` boolean) and `employee_deductions` (`opt_in` boolean + optional `custom_amount`).
   - Kept **voluntary** by default so employees/admins can toggle opt-in per employee, while allowing Admins to flip `is_mandatory = true` globally at any time in the future.

6. **GPS Coordinate Geolocation Check-Ins (`/api/attendance`)**
   - Validates browser/device latitude & longitude using the Haversine great-circle distance formula against the Wellness Center's coordinates and radius (`default 100m`).

---

## Getting Started

### 1. Run Locally (Works Immediately Out-of-the-Box in Demo Mode)
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

### 2. Connect to Supabase & Deploy to Vercel
1. Create a new Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy to Vercel and add the same environment variables in your Vercel Project Settings.
