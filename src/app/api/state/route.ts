import { NextResponse } from "next/server";
import { fetchAllSystemData, resetDemoStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchAllSystemData();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load system state" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const resetData = resetDemoStore();
    return NextResponse.json({
      mode: "demo",
      data: resetData,
      message: "Demo database reset to initial seed state.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to reset demo data" },
      { status: 500 }
    );
  }
}
