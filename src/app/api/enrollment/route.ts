import { NextRequest, NextResponse } from "next/server";
import {
  createEnrollmentCode,
  listEnrollmentCodes,
  revokeEnrollmentCode,
  validateAndConsumeEnrollmentCode,
} from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const verifyCode = searchParams.get("code");

    if (verifyCode) {
      const check = await validateAndConsumeEnrollmentCode(verifyCode, false);
      if (!check.valid) {
        return NextResponse.json({ valid: false, error: check.error }, { status: 400 });
      }
      return NextResponse.json({
        valid: true,
        codeRecord: check.codeRecord,
      });
    }

    const codes = await listEnrollmentCodes();
    return NextResponse.json({ codes });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load enrollment codes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      adminId,
      adminName,
      businessName,
      branchId,
      branchName,
      defaultDepartment,
      defaultPosition,
      defaultBasicSalary,
      defaultDailyShareRate,
      dailyShareEligible,
    } = body as {
      adminId: string;
      adminName: string;
      businessName: string;
      branchId?: string;
      branchName?: string;
      defaultDepartment?: string;
      defaultPosition?: string;
      defaultBasicSalary?: number;
      defaultDailyShareRate?: number;
      dailyShareEligible?: boolean;
    };

    const created = await createEnrollmentCode({
      created_by_admin_id: adminId || "20000000-0000-4000-8000-000000000001",
      created_by_name: adminName || "HR Admin",
      business_name: businessName || "Punch Wellness & Recovery Center",
      branch_id: branchId || null,
      branch_name: branchName || null,
      default_department: defaultDepartment,
      default_position: defaultPosition,
      default_basic_salary: defaultBasicSalary,
      default_daily_share_rate: defaultDailyShareRate,
      daily_share_eligible: dailyShareEligible,
    });

    return NextResponse.json({
      enrollmentCode: created,
      message: `Enrollment code ${created.code} generated! Valid for 1 hour until ${new Date(
        created.expires_at
      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to generate enrollment code" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Code id is required" }, { status: 400 });
    }
    await revokeEnrollmentCode(id);
    return NextResponse.json({ message: "Enrollment code revoked." });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to revoke enrollment code" },
      { status: 500 }
    );
  }
}
