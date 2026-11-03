import { NextRequest, NextResponse } from "next/server";
import {
  getDemoStore,
  isSupabaseSchemaReady,
  saveDemoStore,
} from "@/lib/data-store";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CompanySettings, DeductionType } from "@/types/hr";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companySettingsUpdates,
      deductionTypeUpdates,
    } = body as {
      companySettingsUpdates?: Partial<CompanySettings>;
      deductionTypeUpdates?: Array<Partial<DeductionType> & { id: string }>;
    };

    const nowIso = new Date().toISOString();

    if (await isSupabaseSchemaReady()) {
      const supabase = createSupabaseAdminClient()!;

      if (companySettingsUpdates) {
        const { data: current } = await supabase
          .from("company_settings")
          .select("id")
          .limit(1)
          .single();

        if (current) {
          await supabase
            .from("company_settings")
            .update({
              ...companySettingsUpdates,
              updated_at: nowIso,
            })
            .eq("id", current.id);
        }
      }

      if (deductionTypeUpdates && deductionTypeUpdates.length > 0) {
        for (const dt of deductionTypeUpdates) {
          const { id, ...rest } = dt;
          await supabase.from("deduction_types").update(rest).eq("id", id);
        }
      }

      return NextResponse.json({
        message: "Wellness center geofence & deduction settings updated.",
      });
    }

    const store = getDemoStore();

    if (companySettingsUpdates) {
      store.companySettings = {
        ...store.companySettings,
        ...companySettingsUpdates,
        updated_at: nowIso,
      };
    }

    if (deductionTypeUpdates && deductionTypeUpdates.length > 0) {
      for (const dtUpdate of deductionTypeUpdates) {
        const idx = store.deductionTypes.findIndex((d) => d.id === dtUpdate.id);
        if (idx !== -1) {
          store.deductionTypes[idx] = {
            ...store.deductionTypes[idx],
            ...dtUpdate,
          };
        }
      }
    }

    saveDemoStore(store);

    return NextResponse.json({
      companySettings: store.companySettings,
      deductionTypes: store.deductionTypes,
      message: "System & geofence settings saved.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
