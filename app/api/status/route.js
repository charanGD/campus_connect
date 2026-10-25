import { NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabaseServerClient } from "@/lib/supabaseClient";
import { getAllEvents, getAllRegistrations } from "@/lib/db";

export async function GET() {
  try {
    const configured = isSupabaseConfigured();
    let supabaseStatus = "disconnected";
    let dbType = "In-Memory Store (Supabase Ready)";
    let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

    if (configured) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { error } = await supabase.from("events").select("id", { count: "exact", head: true });
        if (!error) {
          supabaseStatus = "connected";
          dbType = "Supabase PostgreSQL Database";
        } else {
          supabaseStatus = "configured_error";
          console.warn("Supabase connection check error:", error.message);
        }
      }
    }

    const events = await getAllEvents();
    const registrations = await getAllRegistrations();

    // Mask URL for display
    const maskedUrl = url.length > 18 ? url.slice(0, 18) + "..." : url;

    return NextResponse.json({
      configured,
      status: supabaseStatus,
      database: dbType,
      url: maskedUrl,
      totalEvents: events.length,
      totalRegistrations: registrations.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        status: "error",
        error: err.message,
        database: "In-Memory Fallback"
      },
      { status: 500 }
    );
  }
}
