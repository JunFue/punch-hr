import { NextRequest, NextResponse } from "next/server";
import {
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import {
  createEnrollmentCode,
  validateAndConsumeEnrollmentCode,
} from "@/lib/enrollment-store";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { UserProfile } from "@/types/hr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role } = body as { role: "admin" | "employee" };

    const nowIso = new Date().toISOString();

    if (role === "admin") {
      const {
        authUserId,
        email,
        fullName,
        position = "Founder & HR Director",
        department = "Management & HR",
        businessName,
        businessAddress,
        centerLatitude = 14.5547,
        centerLongitude = 121.0244,
        geofenceRadiusMeters = 100,
        workingDaysPerMonth = 26,
        branchName,
        basicSalary = 38000,
        dailyShareRate = 500,
      } = body as {
        authUserId?: string;
        email: string;
        fullName: string;
        position?: string;
        department?: string;
        businessName: string;
        businessAddress: string;
        centerLatitude?: number;
        centerLongitude?: number;
        geofenceRadiusMeters?: number;
        workingDaysPerMonth?: number;
        branchName?: string;
        basicSalary?: number;
        dailyShareRate?: number;
      };

      if (!email || !fullName || !businessName || !businessAddress) {
        return NextResponse.json(
          {
            error:
              "Full name, email, business name, and business address are required for Admin onboarding.",
          },
          { status: 400 }
        );
      }

      let profile: UserProfile | null = null;

      if (await isSupabaseSchemaReady()) {
        const supabase = createSupabaseAdminClient()!;

        // 1. Update Company / Business Settings
        const { data: existingSettings } = await supabase
          .from("company_settings")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (existingSettings?.id) {
          await supabase
            .from("company_settings")
            .update({
              wellness_center_name: businessName.trim(),
              wellness_center_address: businessAddress.trim(),
              center_latitude: Number(centerLatitude),
              center_longitude: Number(centerLongitude),
              geofence_radius_meters: Number(geofenceRadiusMeters),
              working_days_per_month: Number(workingDaysPerMonth),
              updated_at: nowIso,
            })
            .eq("id", existingSettings.id);
        } else {
          await supabase.from("company_settings").insert({
            wellness_center_name: businessName.trim(),
            wellness_center_address: businessAddress.trim(),
            center_latitude: Number(centerLatitude),
            center_longitude: Number(centerLongitude),
            geofence_radius_meters: Number(geofenceRadiusMeters),
            working_days_per_month: Number(workingDaysPerMonth),
          });
        }

        // 2. Check if profile already exists for this email or authUserId
        const { data: existingProf } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", email.trim().toLowerCase())
          .maybeSingle();

        if (existingProf) {
          const { data: updatedProf } = await supabase
            .from("profiles")
            .update({
              full_name: fullName.trim(),
              role: "admin",
              position,
              department,
              updated_at: nowIso,
            })
            .eq("id", existingProf.id)
            .select()
            .single();
          profile = updatedProf as UserProfile;
        } else {
          let userId = authUserId || crypto.randomUUID();
          if (!authUserId) {
            const { data: createdAuth } =
              await supabase.auth.admin.createUser({
                id: userId,
                email: email.trim().toLowerCase(),
                password: "punch-hr-2026",
                email_confirm: true,
                user_metadata: { full_name: fullName.trim(), role: "admin" },
              });
            if (createdAuth?.user?.id) {
              userId = createdAuth.user.id;
            }
          }

          const empCode = `ADM-${String(Math.floor(100 + Math.random() * 900))}`;
          const { data: createdProf, error: profErr } = await supabase
            .from("profiles")
            .upsert({
              id: userId,
              email: email.trim().toLowerCase(),
              full_name: fullName.trim(),
              employee_code: empCode,
              role: "admin",
              position,
              department,
              basic_salary: Number(basicSalary),
              daily_share_rate: Number(dailyShareRate),
              daily_share_eligible: true,
              default_performance_perk: 4000,
              annual_leave_quota: 12,
              quarterly_leave_limit: 3,
              is_active: true,
              joined_date: nowIso.split("T")[0],
            })
            .select()
            .single();

          if (profErr) {
            return NextResponse.json({ error: profErr.message }, { status: 500 });
          }
          profile = createdProf as UserProfile;
        }
      } else {
        const store = getDemoStore();
        store.companySettings = {
          ...store.companySettings,
          wellness_center_name: businessName.trim(),
          wellness_center_address: businessAddress.trim(),
          center_latitude: Number(centerLatitude),
          center_longitude: Number(centerLongitude),
          geofence_radius_meters: Number(geofenceRadiusMeters),
          working_days_per_month: Number(workingDaysPerMonth),
          updated_at: nowIso,
        };

        const existingIdx = store.profiles.findIndex(
          (p) => p.email.toLowerCase() === email.trim().toLowerCase()
        );
        if (existingIdx !== -1) {
          store.profiles[existingIdx] = {
            ...store.profiles[existingIdx],
            full_name: fullName.trim(),
            role: "admin",
            position,
            department,
            updated_at: nowIso,
          };
          profile = store.profiles[existingIdx];
        } else {
          profile = {
            id: authUserId || crypto.randomUUID(),
            email: email.trim().toLowerCase(),
            full_name: fullName.trim(),
            employee_code: `ADM-${store.profiles.length + 1}`,
            role: "admin",
            position,
            department,
            basic_salary: Number(basicSalary),
            daily_share_rate: Number(dailyShareRate),
            daily_share_eligible: true,
            default_performance_perk: 4000,
            annual_leave_quota: 12,
            quarterly_leave_limit: 3,
            is_active: true,
            joined_date: nowIso.split("T")[0],
            created_at: nowIso,
            updated_at: nowIso,
          };
          store.profiles.unshift(profile);
        }
        saveDemoStore(store);
      }

      // Automatically generate the first 1-hour employee enrollment code for this business & primary branch!
      const enrollmentCode = await createEnrollmentCode({
        created_by_admin_id: profile.id,
        created_by_name: profile.full_name,
        business_name: businessName.trim(),
        branch_id: profile.branch_id || null,
        branch_name: branchName || businessName.trim(),
      });

      return NextResponse.json({
        profile,
        enrollmentCode,
        message: `Admin onboarding complete for ${businessName}! Your first 1-hour Employee Enrollment Code (${enrollmentCode.code}) is ready to share.`,
      });
    }

    // EMPLOYEE FIRST-TIME SIGNUP WITH 1-HOUR ENROLLMENT CODE
    const {
      authUserId,
      email,
      fullName,
      enrollmentCode,
      position,
      department,
    } = body as {
      authUserId?: string;
      email: string;
      fullName: string;
      enrollmentCode: string;
      position?: string;
      department?: string;
    };

    if (!email || !fullName || !enrollmentCode) {
      return NextResponse.json(
        {
          error:
            "Full name, Google email, and a valid 1-hour Admin Enrollment Code are required for employee signup.",
        },
        { status: 400 }
      );
    }

    // Validate the 1-hour Enrollment Code
    const codeCheck = await validateAndConsumeEnrollmentCode(
      enrollmentCode,
      true
    );
    if (!codeCheck.valid || !codeCheck.codeRecord) {
      return NextResponse.json(
        { error: codeCheck.error || "Invalid or expired enrollment code." },
        { status: 403 }
      );
    }

    const codeRec = codeCheck.codeRecord;
    const effectivePosition =
      position?.trim() || codeRec.default_position || "Wellness Specialist";
    const effectiveDepartment =
      department?.trim() || codeRec.default_department || "Operations & Therapy";

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;

      const { data: existingProf } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (existingProf) {
        return NextResponse.json({
          profile: existingProf,
          codeRecord: codeRec,
          message: `Welcome to ${codeRec.business_name}, ${fullName}!`,
        });
      }

      let userId = authUserId || crypto.randomUUID();
      if (!authUserId) {
        const { data: createdAuth } = await supabase.auth.admin.createUser({
          id: userId,
          email: email.trim().toLowerCase(),
          password: "punch-hr-2026",
          email_confirm: true,
          user_metadata: { full_name: fullName.trim(), role: "employee" },
        });
        if (createdAuth?.user?.id) {
          userId = createdAuth.user.id;
        }
      }

      const empCode = `EMP-${String(Math.floor(100 + Math.random() * 900))}`;
      const { data: createdProf, error: profErr } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          employee_code: empCode,
          role: "employee",
          branch_id: codeRec.branch_id || null,
          position: effectivePosition,
          department: effectiveDepartment,
          basic_salary: Number(codeRec.default_basic_salary || 20000),
          daily_share_rate: Number(codeRec.default_daily_share_rate || 380),
          daily_share_eligible: Boolean(codeRec.daily_share_eligible),
          default_performance_perk: 1500,
          annual_leave_quota: 12,
          quarterly_leave_limit: 3,
          is_active: true,
          joined_date: nowIso.split("T")[0],
        })
        .select()
        .single();

      if (profErr) {
        return NextResponse.json({ error: profErr.message }, { status: 500 });
      }

      return NextResponse.json({
        profile: createdProf,
        codeRecord: codeRec,
        message: `Enrollment verified with code ${codeRec.code}! Welcome to ${codeRec.business_name}, ${fullName}.`,
      });
    }

    const store = getDemoStore();
    const newProfile: UserProfile = {
      id: authUserId || crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      employee_code: `EMP-00${store.profiles.length + 1}`,
      role: "employee",
      branch_id: codeRec.branch_id || null,
      position: effectivePosition,
      department: effectiveDepartment,
      basic_salary: Number(codeRec.default_basic_salary || 20000),
      daily_share_rate: Number(codeRec.default_daily_share_rate || 380),
      daily_share_eligible: Boolean(codeRec.daily_share_eligible),
      default_performance_perk: 1500,
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
      profile: newProfile,
      codeRecord: codeRec,
      message: `Enrollment verified with code ${codeRec.code}! Welcome to ${codeRec.business_name}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Onboarding failed" },
      { status: 500 }
    );
  }
}
