import { NextRequest, NextResponse } from "next/server";
import { createBranch, deleteBranch, listBranches, updateBranch } from "@/lib/branches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const branches = await listBranches();
    return NextResponse.json({ branches });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch branches" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      address,
      center_latitude,
      center_longitude,
      geofence_radius_meters,
      enforce_geofence,
      working_days_per_month,
    } = body;

    if (!name || typeof center_latitude !== "number" || typeof center_longitude !== "number") {
      return NextResponse.json(
        { error: "Branch name, center latitude, and center longitude are required." },
        { status: 400 }
      );
    }

    const branch = await createBranch({
      name,
      address: address || "",
      center_latitude,
      center_longitude,
      geofence_radius_meters,
      enforce_geofence,
      working_days_per_month,
    });

    return NextResponse.json({
      branch,
      message: `Branch "${branch.name}" created successfully.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create branch" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "Branch id is required" }, { status: 400 });
    }

    const updated = await updateBranch(id, updates);
    return NextResponse.json({
      branch: updated,
      message: "Branch updated successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update branch" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Branch id is required" }, { status: 400 });
    }

    await deleteBranch(id);
    return NextResponse.json({ message: "Branch deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete branch" },
      { status: 500 }
    );
  }
}
