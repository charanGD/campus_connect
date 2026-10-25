import { NextResponse } from "next/server";
import { recommendEvents } from "@/lib/db";

export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}));
    const result = await recommendEvents({
      interests: data.interests || [],
      category: data.category || "All",
      priority: data.priority || "Medium",
      limit: data.limit || 3,
      sort_by: data.sort_by || "score"
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/recommend error:", error);
    return NextResponse.json(
      { error: "Internal server error while generating recommendations." },
      { status: 500 }
    );
  }
}
