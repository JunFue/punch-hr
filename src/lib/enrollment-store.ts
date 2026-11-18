import fs from "fs";
import path from "path";
import { EnrollmentCode } from "@/types/hr";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LOCAL_CODES_PATH = path.join(process.cwd(), ".enrollment-codes.json");

const globalForCodes = globalThis as unknown as {
  __punchHrEnrollmentCodes?: EnrollmentCode[];
  __enrollmentTableExists?: boolean;
};

async function findFallbackAuthUserId(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (adminProfile?.id) {
      return adminProfile.id;
    }

    const { data: usersData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 10,
    });
    const firstUser = usersData?.users?.[0];
    return firstUser?.id || null;
  } catch {
    return null;
  }
}

function generateShortToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let part = "";
  for (let i = 0; i < 6; i++) {
    part += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PUNCH-${part}`;
}

function readLocalCodes(): EnrollmentCode[] {
  if (globalForCodes.__punchHrEnrollmentCodes) {
    return globalForCodes.__punchHrEnrollmentCodes;
  }
  try {
    if (fs.existsSync(LOCAL_CODES_PATH)) {
      const parsed = JSON.parse(
        fs.readFileSync(LOCAL_CODES_PATH, "utf-8")
      ) as EnrollmentCode[];
      globalForCodes.__punchHrEnrollmentCodes = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  globalForCodes.__punchHrEnrollmentCodes = [];
  return [];
}

function writeLocalCodes(codes: EnrollmentCode[]): void {
  globalForCodes.__punchHrEnrollmentCodes = codes;
  try {
    fs.writeFileSync(LOCAL_CODES_PATH, JSON.stringify(codes, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

async function hasEnrollmentTable(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (globalForCodes.__enrollmentTableExists === true) return true;
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return false;
    const { error } = await supabase
      .from("enrollment_codes")
      .select("id")
      .limit(1);
    if (!error) {
      globalForCodes.__enrollmentTableExists = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Reads and writes enrollment codes to `public.enrollment_codes` if the table exists,
 * or persists them in Supabase Auth's `app_metadata` + local file so it works immediately
 * on the live Supabase project even before running the new SQL table migration.
 */
export async function listEnrollmentCodes(): Promise<EnrollmentCode[]> {
  if (await hasEnrollmentTable()) {
    const supabase = createSupabaseAdminClient()!;
    const { data } = await supabase
      .from("enrollment_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) return data as EnrollmentCode[];
  }

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    const fallbackUserId = await findFallbackAuthUserId();
    if (supabase && fallbackUserId) {
      const { data: userRes } =
        await supabase.auth.admin.getUserById(fallbackUserId);
      const metaCodes = userRes?.user?.app_metadata?.enrollment_codes as
        | EnrollmentCode[]
        | undefined;
      if (Array.isArray(metaCodes)) {
        writeLocalCodes(metaCodes);
        return metaCodes;
      }
    }
  }

  return readLocalCodes();
}

async function persistFallbackCodes(codes: EnrollmentCode[]): Promise<void> {
  writeLocalCodes(codes);
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    const fallbackUserId = await findFallbackAuthUserId();
    if (supabase && fallbackUserId) {
      await supabase.auth.admin.updateUserById(fallbackUserId, {
        app_metadata: {
          enrollment_codes: codes.slice(0, 30),
        },
      });
    }
  }
}

export async function createEnrollmentCode(params: {
  created_by_admin_id: string;
  created_by_name: string;
  business_name: string;
  branch_id?: string | null;
  branch_name?: string | null;
  default_department?: string;
  default_position?: string;
  default_basic_salary?: number;
  default_daily_share_rate?: number;
  daily_share_eligible?: boolean;
}): Promise<EnrollmentCode> {
  const now = new Date();
  // Strictly expires within 1 hour (3,600,000 ms)
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  const newCode: EnrollmentCode = {
    id: crypto.randomUUID(),
    code: generateShortToken(),
    branch_id: params.branch_id || null,
    branch_name: params.branch_name || null,
    created_by_admin_id: params.created_by_admin_id,
    created_by_name: params.created_by_name || "HR Admin",
    business_name: params.business_name || "Punch Wellness & Recovery Center",
    default_department: params.default_department || "Operations & Therapy",
    default_position: params.default_position || "Wellness Specialist",
    default_basic_salary: Number(params.default_basic_salary ?? 20000),
    default_daily_share_rate: Number(params.default_daily_share_rate ?? 380),
    daily_share_eligible:
      params.daily_share_eligible !== undefined
        ? Boolean(params.daily_share_eligible)
        : true,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    used_count: 0,
    is_revoked: false,
  };

  if (await hasEnrollmentTable()) {
    const supabase = createSupabaseAdminClient()!;
    const { data, error } = await supabase
      .from("enrollment_codes")
      .insert(newCode)
      .select()
      .single();
    if (!error && data) {
      return data as EnrollmentCode;
    }
  }

  const existing = await listEnrollmentCodes();
  const updated = [newCode, ...existing];
  await persistFallbackCodes(updated);
  return newCode;
}

export async function validateAndConsumeEnrollmentCode(
  rawCode: string,
  consume = true
): Promise<{
  valid: boolean;
  error?: string;
  codeRecord?: EnrollmentCode;
}> {
  const normalized = rawCode.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, error: "Enrollment code is required." };
  }

  const codes = await listEnrollmentCodes();
  const found = codes.find((c) => c.code.toUpperCase() === normalized);

  if (!found) {
    return {
      valid: false,
      error:
        "Invalid enrollment code. Please ask your Admin to generate a new 1-hour enrollment code.",
    };
  }

  if (found.is_revoked) {
    return {
      valid: false,
      error:
        "This enrollment code has been revoked by an Admin. Please request a new code.",
    };
  }

  const nowMs = Date.now();
  const expiresMs = new Date(found.expires_at).getTime();

  if (nowMs > expiresMs) {
    return {
      valid: false,
      error: `This enrollment code expired at ${new Date(
        found.expires_at
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} (codes are valid for 1 hour). Please ask your Admin for a fresh code.`,
    };
  }

  if (consume) {
    const updatedRecord: EnrollmentCode = {
      ...found,
      used_count: (found.used_count || 0) + 1,
    };

    if (await hasEnrollmentTable()) {
      const supabase = createSupabaseAdminClient()!;
      await supabase
        .from("enrollment_codes")
        .update({ used_count: updatedRecord.used_count })
        .eq("id", found.id);
    } else {
      const nextList = codes.map((c) =>
        c.id === found.id ? updatedRecord : c
      );
      await persistFallbackCodes(nextList);
    }

    return { valid: true, codeRecord: updatedRecord };
  }

  return { valid: true, codeRecord: found };
}

export async function revokeEnrollmentCode(codeId: string): Promise<void> {
  if (await hasEnrollmentTable()) {
    const supabase = createSupabaseAdminClient()!;
    await supabase
      .from("enrollment_codes")
      .update({ is_revoked: true })
      .eq("id", codeId);
    return;
  }

  const codes = await listEnrollmentCodes();
  const nextList = codes.map((c) =>
    c.id === codeId ? { ...c, is_revoked: true } : c
  );
  await persistFallbackCodes(nextList);
}
