import { NextRequest, NextResponse } from "next/server";
import {
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { UserProfile, UserRole } from "@/types/hr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      full_name,
      email,
      employee_code,
      role = "employee",
      branch_id = null,
      position = "Wellness Specialist",
      department = "Operations & Therapy",
      basic_salary = 18000,
      daily_share_rate = 350,
      daily_share_eligible = true,
      default_performance_perk = 1000,
    } = body as Partial<UserProfile>;

    if (!full_name || !email) {
      return NextResponse.json(
        { error: "Full name and email are required." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;
      const newId = crypto.randomUUID();

      // Create corresponding Supabase Auth user first (satisfies profiles_id_fkey -> auth.users)
      const { data: authData, error: authErr } =
        await supabase.auth.admin.createUser({
          id: newId,
          email,
          password: "punch-hr-2026",
          email_confirm: true,
          user_metadata: {
            full_name,
            role,
          },
        });

      const userId = authData?.user?.id || newId;
      if (authErr && !authErr.message.toLowerCase().includes("already")) {
        return NextResponse.json({ error: authErr.message }, { status: 500 });
      }

      const { data: created, error } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          full_name,
          email,
          employee_code:
            employee_code || `EMP-${String(Math.floor(100 + Math.random() * 900))}`,
          role: role as UserRole,
          branch_id: branch_id || null,
          position,
          department,
          basic_salary: Number(basic_salary),
          daily_share_rate: Number(daily_share_rate),
          daily_share_eligible: Boolean(daily_share_eligible),
          default_performance_perk: Number(default_performance_perk),
          annual_leave_quota: 12,
          quarterly_leave_limit: 3,
          is_active: true,
          joined_date: nowIso.split("T")[0],
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        employee: created,
        message: `Employee ${full_name} created.`,
      });
    }

    const store = getDemoStore();
    const nextNum = store.profiles.length + 1;
    const newProfile: UserProfile = {
      id: `usr-emp-00${nextNum}-${Date.now()}`,
      email,
      full_name,
      employee_code: employee_code || `EMP-00${nextNum}`,
      role: (role as UserRole) || "employee",
      branch_id: branch_id || null,
      position,
      department,
      basic_salary: Number(basic_salary),
      daily_share_rate: Number(daily_share_rate),
      daily_share_eligible: Boolean(daily_share_eligible),
      default_performance_perk: Number(default_performance_perk),
      annual_leave_quota: 12,
      quarterly_leave_limit: 3,
      is_active: true,
      joined_date: nowIso.split("T")[0],
      created_at: nowIso,
      updated_at: nowIso,
    };

    store.profiles.push(newProfile);
    saveDemoStore(store);

    return NextResponse.json({
      employee: newProfile,
      message: `Employee ${full_name} added to Punch-HR.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create employee" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      employeeId,
      profileUpdates,
      deductionUpdates,
    } = body as {
      employeeId: string;
      profileUpdates?: Partial<UserProfile>;
      deductionUpdates?: Array<{
        deduction_type_id: string;
        opt_in: boolean;
        custom_amount?: number | null;
      }>;
    };

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId is required." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;

      if (profileUpdates && Object.keys(profileUpdates).length > 0) {
        const { error: profErr } = await supabase
          .from("profiles")
          .update({
            ...profileUpdates,
            updated_at: nowIso,
          })
          .eq("id", employeeId);

        if (profErr) {
          return NextResponse.json({ error: profErr.message }, { status: 500 });
        }
      }

      if (deductionUpdates && deductionUpdates.length > 0) {
        for (const ded of deductionUpdates) {
          await supabase.from("employee_deductions").upsert(
            {
              employee_id: employeeId,
              deduction_type_id: ded.deduction_type_id,
              opt_in: ded.opt_in,
              custom_amount:
                ded.custom_amount !== undefined ? ded.custom_amount : null,
              updated_at: nowIso,
            },
            { onConflict: "employee_id,deduction_type_id" }
          );
        }
      }

      return NextResponse.json({
        message: "Employee compensation & deduction settings updated.",
      });
    }

    const store = getDemoStore();
    const empIdx = store.profiles.findIndex((p) => p.id === employeeId);
    if (empIdx === -1) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    if (profileUpdates) {
      store.profiles[empIdx] = {
        ...store.profiles[empIdx],
        ...profileUpdates,
        updated_at: nowIso,
      };
    }

    if (deductionUpdates && deductionUpdates.length > 0) {
      for (const ded of deductionUpdates) {
        const existingIdx = store.employeeDeductions.findIndex(
          (ed) =>
            ed.employee_id === employeeId &&
            ed.deduction_type_id === ded.deduction_type_id
        );
        if (existingIdx !== -1) {
          store.employeeDeductions[existingIdx] = {
            ...store.employeeDeductions[existingIdx],
            opt_in: ded.opt_in,
            custom_amount:
              ded.custom_amount !== undefined
                ? ded.custom_amount
                : store.employeeDeductions[existingIdx].custom_amount,
            updated_at: nowIso,
          };
        } else {
          store.employeeDeductions.push({
            id: `ed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            employee_id: employeeId,
            deduction_type_id: ded.deduction_type_id,
            opt_in: ded.opt_in,
            custom_amount: ded.custom_amount ?? null,
            updated_at: nowIso,
          });
        }
      }
    }

    saveDemoStore(store);

    return NextResponse.json({
      employee: store.profiles[empIdx],
      employeeDeductions: store.employeeDeductions.filter(
        (ed) => ed.employee_id === employeeId
      ),
      message: "Employee compensation & voluntary deductions saved.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update employee" },
      { status: 500 }
    );
  }
}
