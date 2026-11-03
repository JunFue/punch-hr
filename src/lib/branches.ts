import fs from "fs";
import path from "path";
import { Branch } from "@/types/hr";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LOCAL_BRANCHES_PATH = path.join(process.cwd(), ".branches.json");
const ADMIN_SEED_UUID = "20000000-0000-4000-8000-000000000001";

const globalForBranches = globalThis as unknown as {
  __punchHrBranches?: Branch[];
  __branchesTableExists?: boolean;
};

function readLocalBranches(): Branch[] {
  if (globalForBranches.__punchHrBranches) {
    return globalForBranches.__punchHrBranches;
  }
  try {
    if (fs.existsSync(LOCAL_BRANCHES_PATH)) {
      const parsed = JSON.parse(
        fs.readFileSync(LOCAL_BRANCHES_PATH, "utf-8")
      ) as Branch[];
      globalForBranches.__punchHrBranches = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  globalForBranches.__punchHrBranches = [];
  return [];
}

function writeLocalBranches(branches: Branch[]): void {
  globalForBranches.__punchHrBranches = branches;
  try {
    fs.writeFileSync(LOCAL_BRANCHES_PATH, JSON.stringify(branches, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

async function hasBranchesTable(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (globalForBranches.__branchesTableExists === true) return true;
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return false;
    const { error } = await supabase.from("branches").select("id").limit(1);
    if (!error) {
      globalForBranches.__branchesTableExists = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function listBranches(): Promise<Branch[]> {
  if (await hasBranchesTable()) {
    const supabase = createSupabaseAdminClient()!;
    const { data } = await supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: true });
    if (data && data.length > 0) return data as Branch[];
  }

  // Fallback to Supabase company_settings or app_metadata/file
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const { data: settings } = await supabase.from("company_settings").select("*");
      if (settings && settings.length > 0) {
        const converted = settings.map((s) => ({
          id: s.id,
          name: s.wellness_center_name || "Main Branch",
          address: s.wellness_center_address || "",
          center_latitude: s.center_latitude || 14.5547,
          center_longitude: s.center_longitude || 121.0244,
          geofence_radius_meters: s.geofence_radius_meters || 100,
          enforce_geofence: s.enforce_geofence ?? true,
          working_days_per_month: s.working_days_per_month || 26,
          created_at: s.updated_at || new Date().toISOString(),
          updated_at: s.updated_at || new Date().toISOString(),
        }));
        writeLocalBranches(converted);
        return converted;
      }
    }
  }

  return readLocalBranches();
}

export async function createBranch(params: {
  name: string;
  address: string;
  center_latitude: number;
  center_longitude: number;
  geofence_radius_meters?: number;
  enforce_geofence?: boolean;
  working_days_per_month?: number;
}): Promise<Branch> {
  const nowIso = new Date().toISOString();
  const newBranch: Branch = {
    id: crypto.randomUUID(),
    name: params.name.trim(),
    address: params.address.trim(),
    center_latitude: Number(params.center_latitude),
    center_longitude: Number(params.center_longitude),
    geofence_radius_meters: Number(params.geofence_radius_meters ?? 100),
    enforce_geofence: params.enforce_geofence ?? true,
    working_days_per_month: Number(params.working_days_per_month ?? 26),
    created_at: nowIso,
    updated_at: nowIso,
  };

  if (await hasBranchesTable()) {
    const supabase = createSupabaseAdminClient()!;
    const { data, error } = await supabase
      .from("branches")
      .insert(newBranch)
      .select()
      .single();
    if (!error && data) return data as Branch;
  }

  // Also sync to company_settings if matching
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      await supabase.from("company_settings").insert({
        id: newBranch.id,
        wellness_center_name: newBranch.name,
        wellness_center_address: newBranch.address,
        center_latitude: newBranch.center_latitude,
        center_longitude: newBranch.center_longitude,
        geofence_radius_meters: newBranch.geofence_radius_meters,
        enforce_geofence: newBranch.enforce_geofence,
        working_days_per_month: newBranch.working_days_per_month,
      });
    }
  }

  const existing = await listBranches();
  const nextList = [...existing, newBranch];
  writeLocalBranches(nextList);
  return newBranch;
}

export async function updateBranch(
  id: string,
  params: Partial<Branch>
): Promise<Branch | null> {
  const nowIso = new Date().toISOString();

  if (await hasBranchesTable()) {
    const supabase = createSupabaseAdminClient()!;
    const { data } = await supabase
      .from("branches")
      .update({ ...params, updated_at: nowIso })
      .eq("id", id)
      .select()
      .single();
    if (data) return data as Branch;
  }

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      await supabase
        .from("company_settings")
        .update({
          wellness_center_name: params.name,
          wellness_center_address: params.address,
          center_latitude: params.center_latitude,
          center_longitude: params.center_longitude,
          geofence_radius_meters: params.geofence_radius_meters,
          enforce_geofence: params.enforce_geofence,
          working_days_per_month: params.working_days_per_month,
          updated_at: nowIso,
        })
        .eq("id", id);
    }
  }

  const existing = await listBranches();
  const nextList = existing.map((b) =>
    b.id === id ? { ...b, ...params, updated_at: nowIso } : b
  );
  writeLocalBranches(nextList);
  return nextList.find((b) => b.id === id) || null;
}

export async function deleteBranch(id: string): Promise<void> {
  if (await hasBranchesTable()) {
    const supabase = createSupabaseAdminClient()!;
    await supabase.from("branches").delete().eq("id", id);
  }

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      await supabase.from("company_settings").delete().eq("id", id);
    }
  }

  const existing = await listBranches();
  const nextList = existing.filter((b) => b.id !== id);
  writeLocalBranches(nextList);
}
